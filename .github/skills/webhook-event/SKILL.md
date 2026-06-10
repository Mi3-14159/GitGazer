---
name: webhook-event
description: 'Add support for a new GitHub webhook event type in the GitGazer ingestion pipeline, or understand/debug how webhook events flow end-to-end. Use when handling a new GitHub event (e.g. workflow_job, workflow_run, pull_request, deployment), writing an importer, adding payload type guards, debugging signature verification (verifyGithubSign / x-hub-signature-256), the SQS worker, RLS-scoped upserts, or workflow-job alerting. Covers the async API → SQS FIFO → worker → importer → upsert → WebSocket/alerting sequence.'
license: MIT
---

# GitHub Webhook Events — GitGazer

Add or debug a GitHub webhook event type. Ingestion is **asynchronous**: the API Lambda validates and enqueues; a worker Lambda persists and fans out. The whole pipeline lives in [apps/api/src/domains/webhooks/](../../../apps/api/src/domains/webhooks/).

## When to Use

- Supporting a new GitHub event type (new importer + dispatch case)
- Adding a payload type guard
- Debugging signature verification, the SQS worker, RLS upserts, or alerting

## End-to-End Flow (verified)

```
GitHub ──POST /api/import/:integrationId──▶ API Gateway ──▶ API Lambda
  headers: x-hub-signature-256, x-github-event
        │
        ▼  [verifyGithubSign] middleware
  look up integrations.secret via withRlsTransaction → HMAC-SHA256 → crypto.timingSafeEqual
        │ (401 on mismatch)
        ▼  route handler (webhooks.routes.ts)
  isValidImportEvent(x-github-event)?  ── ping → {message:'ok'}
        │
        ▼  handleEvent() → sendWebhookEvent() ──▶ SQS FIFO (MessageGroupId = integrationId)
  API returns {message:'ok'}  ◀── REQUEST ENDS HERE (no DB work in the API)
        │
        ▼  SQS triggers Worker Lambda (handlers/worker.ts)
  processRecord() → insertEvent()  [withRlsTransaction, writer role]
        │   inserts raw payload into `events`, then switch(eventType) → importer(s)
        │   importers call shared upsert helpers: INSERT ... ON CONFLICT DO UPDATE ... RETURNING
        ▼  post-commit (try/catch, never retried):
  postToConnections('workflows', …) → WebSocket push
  workflow_job → sendWorkflowJobAlerts(data as WorkflowJobWithRelations) → Slack
```

Key files:

- Route + signature: [webhooks.routes.ts](../../../apps/api/src/domains/webhooks/webhooks.routes.ts), [webhooks.middleware.ts](../../../apps/api/src/domains/webhooks/webhooks.middleware.ts)
- Allow-list: `isValidImportEvent` / `IMPORT_EVENT_NAMES` in [apps/api/src/shared/helpers/validation.ts](../../../apps/api/src/shared/helpers/validation.ts)
- Enqueue: [webhooks.controller.ts](../../../apps/api/src/domains/webhooks/webhooks.controller.ts)
- Worker: [handlers/worker.ts](../../../apps/api/src/handlers/worker.ts), [worker/batch-processor.ts](../../../apps/api/src/domains/webhooks/worker/batch-processor.ts)
- Dispatch + persistence: [importers/index.ts](../../../apps/api/src/domains/webhooks/importers/index.ts), upserts in [importers/shared.ts](../../../apps/api/src/domains/webhooks/importers/shared.ts)
- Alerting: [alerting/alerting.controller.ts](../../../apps/api/src/domains/alerting/alerting.controller.ts)

## Procedure: support a new event type

1. **Allow-list the event** — add its name to `IMPORT_EVENT_NAMES` in [validation.ts](../../../apps/api/src/shared/helpers/validation.ts). Events not listed are rejected before enqueue.

2. **Add new tables if the event introduces new entities** — follow the `db-migration` skill (tenant table: `integrationId` FK, composite PK, RLS policies, `.enableRLS()`). Reuse existing tables where possible.

3. **Write the importer** — create `importers/<event>.importer.ts` from [importer.template.ts](./assets/importer.template.ts). It receives the shared `tx` (already inside the writer RLS transaction) — never open its own transaction. Use `onConflictDoUpdate` with a `setWhere` guard so duplicate deliveries don't churn rows.

4. **Wire up dispatch** — add a `case '<event>':` to the `switch (eventType)` in [importers/index.ts](../../../apps/api/src/domains/webhooks/importers/index.ts), calling your importer.

5. **Type the payload** — event payload types are re-exported from `@octokit/webhooks-types` (e.g. `WorkflowJobEvent`). For structural runtime checks, add an `is<Type>` guard in [packages/db/src/types/index.ts](../../../packages/db/src/types/index.ts) or `importers/types.ts`, following the existing `isEnterprise` / `isNotificationRule` pattern.

6. **(Optional) Post-commit side effects** — if the new event should push to the UI or trigger alerts, add it in [batch-processor.ts](../../../apps/api/src/domains/webhooks/worker/batch-processor.ts). Keep these in the existing `try/catch`: a side-effect failure must NOT cause an SQS retry (the data is already committed).

7. **Test** — colocate `<event>.importer.test.ts`. Mock `@gitgazer/db/client` (fake `withRlsTransaction`) and mock schema tables; assert the upsert chain. Mirror [pull-request.importer.test.ts](../../../apps/api/src/domains/webhooks/importers/pull-request.importer.test.ts). Never call real AWS/DB.

## Gotchas (verified)

- **Async boundary**: the API does zero DB work. If you put persistence in the route handler instead of the importer/worker, you've broken the architecture.
- **Idempotency**: SQS FIFO can redeliver. Upserts must be idempotent; rely on the composite `(integrationId, id)` conflict target.
- **`workflow_job` alerting** uses `WorkflowJobWithRelations` — the query must include `workflowRun`, `sender`, and `repository.{organization, owner}` (see `workflowJobRelations` in [packages/db/src/queries/index.ts](../../../packages/db/src/queries/index.ts)). Missing relations break alert context.
- **Alerting gate**: only `status === 'completed' && conclusion === 'failure'` jobs alert.
- **Signature**: header is `x-hub-signature-256`, HMAC-SHA256, compared with `crypto.timingSafeEqual`; the secret is the per-integration `integrations.secret`, not a global env var.

## Checklist

- [ ] Event name added to `IMPORT_EVENT_NAMES`
- [ ] New entities have RLS-enabled tenant tables (via `db-migration`)
- [ ] Importer uses the shared `tx`; upserts are idempotent with `onConflictDoUpdate` + `setWhere`
- [ ] `switch` case added in `importers/index.ts`
- [ ] Payload typed from `@octokit/webhooks-types`; `is<Type>` guard added if needed
- [ ] Post-commit side effects kept non-retrying in `batch-processor`
- [ ] Importer test added with DB + AWS mocked
