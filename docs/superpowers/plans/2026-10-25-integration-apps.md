# Integration Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn GitHub into an installed app of an integration, add a Webhook app whose handles are Slack incoming webhook URLs, point notification rules at handles, and give each integration its own page with Apps / Members / Settings tabs.

**Architecture:** Five new tenant tables in the `gitgazer` schema (`integration_apps`, `integration_app_github_settings`, `notification_handles`, `webhook_handle_details`, `notification_rule_destinations`). An expand migration creates and backfills them; all code switches to them in one deploy; a later contract migration drops the old columns. Alert delivery stays on `buildSlackAlert` + `proxyFetch`; only the URL source changes.

**Tech Stack:** TypeScript, Drizzle ORM (Aurora PostgreSQL, RLS), AWS Powertools event-handler router, Vitest, Vue 3 + Radix Vue + Tailwind 4, Terraform (API Gateway route map).

**Spec:** [docs/superpowers/specs/2026-10-25-integration-apps-design.md](../specs/2026-10-25-integration-apps-design.md) (mockup next to it). Read it before any task.

## Global Constraints

- Nothing renames `integration` / `integration_id`.
- Every new table: `integrationId` uuid FK → `integrations.integrationId` `onDelete: 'cascade'`, composite PK with `integrationId` first, `writerTenantSeparationPolicy()` + `readerTenantSeparationPolicy()`, `.enableRLS()`, **no** `mcpTenantSeparationPolicy()`. Follow `.github/skills/db-migration/SKILL.md`.
- App types: `['github', 'webhook'] as const`; at most one app per type per integration (unique `(integration_id, type)`).
- No `app_id` on GitHub data tables; no `app_type` column on `notification_handles` (type is derived via `app_id`).
- Handle URLs: today's `isAllowedWebhookUrl` (HTTPS, `hooks.slack.com`). Max 20 handles per Webhook app.
- Webhook URLs and the GitHub secret are returned only to `admin`/`owner`; `null` for `member`/`viewer`. Never logged.
- `http-proxy` lambda and `buildSlackAlert` are not changed.
- Removing the GitHub app keeps all collected data and org-synced members.
- Migrated handles are named `Slack webhook 1`, `Slack webhook 2`, … per integration, ordered by first use.
- One Slack post per handle per failed job, even when several matching rules share the handle.
- Path aliases: `@/` inside an app, `@gitgazer/*` across packages; never relative cross-project imports.
- Comments only for a non-obvious why. Repo text in English.
- Every task's verification also runs the package's `pretty:check` (or `npx prettier --check <changed files>`) besides lint; fix only what the task caused.
- GitGazer's concept is "integration app" in code (`IntegrationApp*`, `integration_apps`) — never bare "GitHub App", which is GitHub's product (`github_app_installations`).

## Review Focus

1. **Viewer opening the Apps tab** — must see app cards and handle names but `secret` and `url` are `null` in the API response. Test in Task 5.
2. **Rule saved with a handle ID from another integration (or a deleted one)** — 400, nothing written. Test in Task 6.
3. **Rule whose only handle was deleted** — rule stays, alert run sends nothing and does not throw; editor shows a warning. Tests in Tasks 7 and 10.
4. **Ingest or org sync for an integration whose GitHub app was removed** — ingest rejected exactly like an unknown integration; org sync skipped, not crashed. Tests in Tasks 3 and 4.
5. **Migration of rules that share one URL, or that have no channels** — one handle per distinct URL per integration; integrations without URLs get no Webhook app. Verified by the cutover queries in Task 2.

---

### Task 1: Schema, types and expand DDL

**Files:**
- Create: `packages/db/src/types/apps.ts`
- Modify: `packages/db/src/types/index.ts` (export `./apps`)
- Modify: `packages/db/src/schema/gitgazer.ts` (five tables)
- Modify: `packages/db/src/schema/relations.ts`
- Create: generated `packages/db/drizzle/<timestamp>_integration_apps/`

**Interfaces:**
- Produces (types, `@gitgazer/db/types`):
  - `INTEGRATION_APP_TYPES = ['github', 'webhook'] as const`, `type IntegrationAppType`, `isIntegrationAppType(v: unknown): v is IntegrationAppType`
  - `MAX_WEBHOOK_HANDLES = 20`
  - `type NotificationHandle = {handleId: string; appId: string; name: string; url: string | null; ruleCount: number}`
  - `type GithubAppSettings = {secret: string | null; orgSyncDefaultRole: OrgSyncDefaultRole}`
  - `type IntegrationApp = {appId: string; type: 'github'; createdAt: string; settings: GithubAppSettings} | {appId: string; type: 'webhook'; createdAt: string; handles: NotificationHandle[]}`
- Produces (schema, `@gitgazer/db/schema`): `integrationApps`, `integrationAppGithubSettings`, `notificationHandles`, `webhookHandleDetails`, `notificationRuleDestinations` with these columns:
  - `integrationApps`: `integrationId`, `appId` (uuid, defaultRandom), `type` (varchar 20, enum `INTEGRATION_APP_TYPES`), `createdAt`; PK `(integrationId, appId)`; unique `(integrationId, type)`.
  - `integrationAppGithubSettings`: `integrationId`, `appId`, `secret` (uuid, defaultRandom, notNull), `orgSyncDefaultRole` (as on `integrations` today); PK `(integrationId, appId)`; FK `(integrationId, appId)` → `integrationApps` cascade.
  - `notificationHandles`: `integrationId`, `handleId` (uuid defaultRandom), `appId`, `name` (varchar 100), `createdAt`, `updatedAt`; PK `(integrationId, handleId)`; FK `(integrationId, appId)` → `integrationApps` cascade; index `(integrationId, appId)`.
  - `webhookHandleDetails`: `integrationId`, `handleId`, `url` (text notNull); PK `(integrationId, handleId)`; FK → `notificationHandles` cascade.
  - `notificationRuleDestinations`: `integrationId`, `ruleId`, `handleId`; PK `(integrationId, ruleId, handleId)`; FK `(integrationId, ruleId)` → `notificationRules (integrationId, id)` cascade; FK `(integrationId, handleId)` → `notificationHandles` cascade; index `(integrationId, handleId)`.
- `integrations.secret`, `integrations.orgSyncDefaultRole`, `notificationRules.channels` stay in the schema until Task 11.
- [ ] **Step 1:** Write `apps.ts` with the types above, mirroring `ORG_SYNC_DEFAULT_ROLES` / `isOrgSyncDefaultRole` style in `types/members.ts`.
- [ ] **Step 2:** Add the five tables to `gitgazer.ts` (composite FKs via `foreignKey({columns, foreignColumns}).onDelete('cascade')`, as `organizations` → `enterprises` does in `github/workflows.ts`). Add relations: `integrations.apps` (many), `integrationApps.githubSettings` (one), `integrationApps.handles` (many), `notificationHandles.webhookDetails` (one), `notificationHandles.destinations` (many), `notificationRules.destinations` (many).
- [ ] **Step 3:** Run `cd packages/db && npx drizzle-kit generate --name=integration_apps`. Open the SQL: five `CREATE TABLE`, five `ENABLE ROW LEVEL SECURITY`, ten `CREATE POLICY` (writer + reader each), no `GRANT`, no `DROP`.
- [ ] **Step 4:** Run `pnpm --filter @gitgazer/db typecheck && pnpm --filter @gitgazer/db lint`, then `pnpm nx run-many -t typecheck`. Expected: all pass (nothing reads the new tables yet).
- [ ] **Step 5: Commit** `feat: add integration apps schema`

### Task 2: Backfill migration and cutover runbook

**Files:**
- Create: `packages/db/drizzle/<timestamp>_integration_apps_backfill/migration.sql` via `npx drizzle-kit generate --custom --name=integration_apps_backfill`
- Create: `docs/superpowers/plans/2026-10-25-integration-apps-cutover.md`

**Interfaces:** Consumes Task 1 tables. Produces populated tables.

- [ ] **Step 1: Write the backfill SQL** (statements separated by `--> statement-breakpoint`). The handle numbering is the one non-obvious part:

```sql
INSERT INTO gitgazer.integration_apps (integration_id, type)
SELECT integration_id, 'github' FROM github.integrations;

INSERT INTO gitgazer.integration_app_github_settings (integration_id, app_id, secret, org_sync_default_role)
SELECT a.integration_id, a.app_id, i.secret, i.org_sync_default_role
FROM gitgazer.integration_apps a JOIN github.integrations i USING (integration_id)
WHERE a.type = 'github';

CREATE TEMP TABLE migrated_handles ON COMMIT DROP AS
WITH urls AS (
  SELECT r.integration_id, c->>'webhook_url' AS url, min(r.created_at) AS first_used
  FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c
  GROUP BY r.integration_id, c->>'webhook_url'
)
SELECT integration_id, url, gen_random_uuid() AS handle_id,
       'Slack webhook ' || row_number() OVER (PARTITION BY integration_id ORDER BY first_used, url) AS name
FROM urls;

INSERT INTO gitgazer.integration_apps (integration_id, type)
SELECT DISTINCT integration_id, 'webhook' FROM migrated_handles;

INSERT INTO gitgazer.notification_handles (integration_id, handle_id, app_id, name)
SELECT m.integration_id, m.handle_id, a.app_id, m.name
FROM migrated_handles m JOIN gitgazer.integration_apps a ON a.integration_id = m.integration_id AND a.type = 'webhook';

INSERT INTO gitgazer.webhook_handle_details (integration_id, handle_id, url)
SELECT integration_id, handle_id, url FROM migrated_handles;

INSERT INTO gitgazer.notification_rule_destinations (integration_id, rule_id, handle_id)
SELECT DISTINCT r.integration_id, r.id, m.handle_id
FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c
JOIN migrated_handles m ON m.url = c->>'webhook_url'
WHERE m.integration_id = r.integration_id;
```

If `drizzle-kit migrate` does not wrap the file in one transaction, replace `ON COMMIT DROP` with an explicit `DROP TABLE migrated_handles;` at the end.

- [ ] **Step 2: Write the cutover runbook** with: (1) announce a few-minute freeze on secret rotation, integration creation and rule edits; (2) `cd packages/db && pnpm run migrate`; (3) run the verification queries below, all must return `0`; (4) merge/deploy the branch (`ci_cd.yaml`); (5) smoke test: one GitHub delivery accepted, one Slack alert posted; (6) fix forward, no lambda rollback.

```sql
SELECT count(*) FROM github.integrations i LEFT JOIN gitgazer.integration_app_github_settings s USING (integration_id) WHERE s.secret IS DISTINCT FROM i.secret OR s.org_sync_default_role IS DISTINCT FROM i.org_sync_default_role;
SELECT count(*) FROM (SELECT r.integration_id, r.id, c->>'webhook_url' u FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c) x
  WHERE NOT EXISTS (SELECT 1 FROM gitgazer.notification_rule_destinations d JOIN gitgazer.webhook_handle_details w USING (integration_id, handle_id) WHERE d.integration_id = x.integration_id AND d.rule_id = x.id AND w.url = x.u);
SELECT count(*) FROM (SELECT integration_id, url FROM gitgazer.webhook_handle_details GROUP BY 1, 2 HAVING count(*) > 1) dup;
SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'gitgazer_mcp' AND table_schema = 'gitgazer'
  AND table_name IN ('integration_apps', 'integration_app_github_settings', 'notification_handles', 'webhook_handle_details', 'notification_rule_destinations');
```

Note in the runbook: the web app is live as soon as it is uploaded, the new API routes only after `terraform apply`, so `/apps` can return 404 for a few minutes; that is covered by fix-forward.

- [ ] **Step 3:** Do **not** run the migration now. Commit `feat: backfill integration apps from existing integrations and rules`.

### Task 3: GitHub settings in the api lambda

**Files:**
- Create: `apps/lambdas/api/src/domains/apps/github-settings.ts`
- Test: `apps/lambdas/api/src/domains/apps/github-settings.test.ts`
- Modify: `apps/lambdas/api/src/domains/webhooks/webhooks.middleware.ts` (+ test)
- Modify: `apps/lambdas/api/src/domains/github-app/webhook-provisioning.ts:33-43,~165` (+ test)
- Modify: `apps/lambdas/api/src/domains/integrations/integrations.controller.ts` (`createIntegration`, `rotateSecret`, `updateOrgSyncSettings`) (+ test)
- Modify: `apps/lambdas/api/src/domains/integrations/integrations.routes.ts:203-211`
- Modify: `apps/lambdas/api/src/domains/github-app/github-app.controller.ts:~265-285` (+ test)

**Interfaces:**
- Produces in `github-settings.ts`:
  - `getGithubSettings(tx: RdsTransaction, integrationId: string): Promise<{appId: string; secret: string; orgSyncDefaultRole: OrgSyncDefaultRole} | undefined>` — joins `integrationApps` (type `github`) with `integrationAppGithubSettings`.
  - `installGithubApp(tx: RdsTransaction | typeof db, integrationId: string): Promise<{appId: string}>` — inserts the app row and a settings row (DB defaults give a new secret and `viewer`).
- `rotateSecret` and `updateOrgSyncSettings` update `integrationAppGithubSettings`; they throw `NotFoundError('GitHub app not installed')` when no settings row matches.
- `createIntegration` calls `installGithubApp` inside its existing transaction.

- [ ] **Step 1: Failing tests.**
  - `webhooks.middleware.test.ts`: `it('verifies the signature with the GitHub app secret')` (fake tx returns `[{secret: 'shh'}]` from the settings join) and `it('rejects when the integration has no GitHub app')` → `InternalServerError('Integration secret not configured')`, same as today's unknown integration.
  - `integrations.controller.test.ts`: `it('creates a GitHub app with the integration')` asserts an insert into `integrationApps` with `type: 'github'` and into `integrationAppGithubSettings`; `it('rotates the secret on the GitHub app settings')`; `it('rotateSecret throws NotFound without a GitHub app')`.
  - `webhook-provisioning.test.ts`: existing `[{secret: 'sek'}]` mocks now come from the settings lookup; `it('throws when the integration has no GitHub app')`.
  - `github-app.controller.test.ts`: org-sync join now uses `integrationAppGithubSettings.orgSyncDefaultRole`; `it('skips member sync when the linked integration has no GitHub app')`.
- [ ] **Step 2:** Run `cd apps/lambdas/api && pnpm run test:unit`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement `github-settings.ts`; switch every reader/writer listed under Files from `integrations.secret` / `integrations.orgSyncDefaultRole` to it. In `github-app.controller.ts` and the link route, replace `innerJoin(integrations, …)` with `innerJoin(integrationAppGithubSettings, eq(githubAppInstallations.integrationId, integrationAppGithubSettings.integrationId))`.
- [ ] **Step 4:** Run `pnpm run test:unit && pnpm run lint` in `apps/lambdas/api`. Expected: PASS. `grep -rn "integrations.secret\|integrations.orgSyncDefaultRole\|\.secret\b" apps/lambdas/api/src --include=*.ts | grep -v test` shows only `github-settings.ts` and the provisioning secret parameter.
- [ ] **Step 5: Commit** `feat: read GitHub secret and org sync role from the GitHub app`

### Task 4: GitHub settings in backend-services org sync

**Files:**
- Modify: `packages/backend-services/src/org-member-sync.ts:~80-96` and the second join near the end (+ `org-member-sync.test.ts`)
- Check: `packages/backend-services/src/org-member-resolver.ts` (takes `role` as a parameter; expect no change)

**Interfaces:** Consumes `integrationAppGithubSettings` from Task 1. No new exports.

- [ ] **Step 1: Failing tests** in `org-member-sync.test.ts`: the mocked `integrations` table symbol for `orgSyncDefaultRole` moves to `integrationAppGithubSettings`; add `it('skips reconciliation when the integration has no GitHub app')` (join returns `[]` → no assignment writes).
- [ ] **Step 2:** `cd packages/backend-services && pnpm run test:unit` → FAIL.
- [ ] **Step 3:** Replace `innerJoin(integrations, …)` / `integrations.orgSyncDefaultRole` with `integrationAppGithubSettings`.
- [ ] **Step 4:** `pnpm run test:unit && pnpm run lint` → PASS.
- [ ] **Step 5: Commit** `feat: take the org sync role from the GitHub app`

### Task 5: Apps and handles API

**Files:**
- Create: `apps/lambdas/api/src/domains/apps/apps.controller.ts`, `apps.routes.ts`, `apps.controller.test.ts` (follow `.github/skills/new-domain/SKILL.md`)
- Create: `apps/lambdas/api/src/domains/github-app/unlink-installation.ts` (extracted from the `DELETE …/github-app/:installationId` route body) + test
- Modify: `apps/lambdas/api/src/domains/integrations/integrations.routes.ts` (route uses `unlinkInstallation`)
- Modify: `apps/lambdas/api/src/shared/router/index.ts` (register `appsRoutes`)
- Modify: `infra/api_rest.tf` route map

**Interfaces:**
- `unlinkInstallation(integrationId: string, installationId: number): Promise<void>` — deprovision webhooks (errors logged), set `integration_id` NULL, event log entry. Behaviour identical to today's route.
- Controller (all take `integrationIds: string[]` for RLS, like the integrations controller):
  - `listApps(params: {integrationId: string; integrationIds: string[]; canSeeSecrets: boolean}): Promise<IntegrationApp[]>` — `secret`/`url` are `null` when `!canSeeSecrets`; `ruleCount` from `notificationRuleDestinations`.
  - `installApp(params: {integrationId; integrationIds; type: IntegrationAppType}): Promise<IntegrationApp>` — `github` via `installGithubApp`; `ConflictError` if that type is installed.
  - `uninstallApp(params: {integrationId; integrationIds; appId: string}): Promise<void>` — for `github`: `unlinkInstallation` for every installation linked to the integration, then delete the app row (cascade removes settings). For `webhook`: delete the app row. Event log entry `category: 'integration'`.
  - `createHandle(params: {integrationId; integrationIds; appId; name: string; url: string}): Promise<NotificationHandle>`
  - `updateHandle(params: {integrationId; integrationIds; handleId: string; name?: string; url?: string}): Promise<NotificationHandle>`
  - `deleteHandle(params: {integrationId; integrationIds; handleId: string}): Promise<void>`
- Routes (all `[addUserIntegrationsToCtx, requireRole(…)]`):
  - `GET /api/integrations/:integrationId/apps` — `viewer`; `canSeeSecrets = hasRole(role, 'admin')`
  - `POST /api/integrations/:integrationId/apps` body `{type}` — `admin`
  - `DELETE /api/integrations/:integrationId/apps/:appId` — `admin`
  - `POST /api/integrations/:integrationId/apps/:appId/handles` body `{name, url}` — `admin`
  - `PATCH /api/integrations/:integrationId/handles/:handleId` body `{name?, url?}` — `admin`
  - `DELETE /api/integrations/:integrationId/handles/:handleId` — `admin`
- Validation: `name` trimmed, 1–100 chars; `url` passes `isAllowedWebhookUrl` (export it from `types/notifications.ts` if not exported); app must be type `webhook` for handle routes (`BadRequestError`); count < `MAX_WEBHOOK_HANDLES` (`BadRequestError('A Webhook app holds at most 20 handles')`).
- Terraform: add to the route map `"integrations/{integrationId}/apps" = {methods = ["GET", "POST"]}`, `"integrations/{integrationId}/apps/{appId}" = {methods = ["DELETE"]}`, `"integrations/{integrationId}/apps/{appId}/handles" = {methods = ["POST"]}`, `"integrations/{integrationId}/handles/{handleId}" = {methods = ["PATCH", "DELETE"]}`.

- [ ] **Step 1: Failing tests** in `apps.controller.test.ts`:
  - `listApps hides secret and urls without canSeeSecrets` → `settings.secret === null`, every `handles[].url === null`, names present.
  - `listApps returns secret and urls with canSeeSecrets`.
  - `installApp rejects a second app of the same type` → `ConflictError`.
  - `uninstallApp(github) unlinks every installation and deletes the app` → `unlinkInstallation` called per installation; delete on `integrationApps`; no delete on any `github.*` data table.
  - `createHandle rejects a non-Slack url` (`https://example.com/x`) → `BadRequestError`.
  - `createHandle rejects the 21st handle`.
  - `createHandle rejects a handle on the github app`.
  - `unlink-installation.test.ts`: `deprovisions, unlinks and logs` (port the existing route behaviour).
- [ ] **Step 2:** `cd apps/lambdas/api && pnpm run test:unit` → FAIL.
- [ ] **Step 3:** Implement `unlink-installation.ts`, the controller and routes; register the router; add the Terraform entries; run `terraform fmt` in `infra/`.
- [ ] **Step 4:** `pnpm run test:unit && pnpm run lint` → PASS; `cd infra && terraform fmt -check` → no diff.
- [ ] **Step 5: Commit** `feat: add apps and notification handles API`

### Task 6: Rules reference handles

**Files:**
- Modify: `packages/db/src/types/notifications.ts`
- Modify: `apps/lambdas/api/src/domains/notifications/notifications.controller.ts` (+ test)

**Interfaces:**
- `NotificationRule`: replace `channels: NotificationRuleChannel[]` with `handleIds: string[]`. `NotificationRuleUpdate` follows (it is derived).
- `isNotificationRuleUpdate` / `isNotificationRule`: `handleIds` is an array of ≤ 20 strings matching the uuid shape; `channels` is no longer accepted.
- Keep `NotificationRuleChannel`, `NotificationRuleChannelType` and `isNotificationRuleChannel` only as long as the schema's `channels` column needs the type (removed in Task 11). Keep `isAllowedWebhookUrl` exported.
- `getNotificationRules` returns `handleIds` aggregated from `notificationRuleDestinations`; no URL appears in the response.
- `upsertNotificationRule`, in its single RLS writer transaction: (1) select `notificationHandles` where `integrationId` and `handleId in handleIds`; if the count differs from the distinct input count → `BadRequestError('Unknown notification handle')` before any write; (2) upsert the rule (write `channels: []` while the column exists); (3) delete its destinations; (4) insert the new ones. Event log message says `destinations: <n>` instead of `channels: <types>`.

- [ ] **Step 1: Failing tests** in `notifications.controller.test.ts` (replace `channels: []` fixtures with `handleIds: []`):
  - `rejects a handle id that is not in the integration` → `BadRequestError`, no insert/delete on rules or destinations.
  - `replaces the rule destinations on update` → delete then insert `[{integrationId, ruleId, handleId: 'h1'}]`.
  - `getNotificationRules returns handleIds and no urls` → `JSON.stringify(result)` does not contain `hooks.slack.com`.
  - `isNotificationRuleUpdate rejects a payload with channels but no handleIds`.
- [ ] **Step 2:** `cd apps/lambdas/api && pnpm run test:unit` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm run test:unit && pnpm run lint` → PASS.
- [ ] **Step 5: Commit** `feat: point notification rules at notification handles`

### Task 7: Alerts go to handles

**Files:**
- Modify: `packages/backend-services/src/alerting.controller.ts` (+ `alerting.controller.test.ts`)

**Interfaces:**
- `findMatchingNotificationRules` unchanged.
- New `loadHandleTargets(integrationId: string, rules: MatchingRule[]): Promise<{handleId: string; url: string; includeLogDetails: boolean}[]>` — one RLS read joining `notificationRuleDestinations` → `webhookHandleDetails` for the matching rule ids; one entry per handle; `includeLogDetails` is true if any matching rule pointing at that handle has `include_log_details`.
- Send loop: for each target, `buildSlackAlert({...alertInput, details: target.includeLogDetails ? details : null})` and `sendSlackNotification(target.url, …, {...logIds, handleId})`. Remove `getSlackWebhookUrls` and the ineffective `retries: 3`. Log context uses `handleId`, never the URL.

- [ ] **Step 1: Failing tests** (fixtures: `rule()` loses `channels`; seed `notificationRuleDestinations` + `webhookHandleDetails` rows in the fake tx):
  - `posts once per handle when two matching rules share it` → `mockProxyFetch` called once.
  - `includes details for a shared handle if any of its rules opted in`.
  - `a rule without destinations sends nothing and does not throw` → no `proxyFetch`, event log entry still written.
  - Existing tests (`a Slack post failure for one channel does not stop the others`, `omits details for rules that opted out`, …) keep passing with destinations instead of channels.
- [ ] **Step 2:** `cd packages/backend-services && pnpm run test:unit` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm run test:unit && pnpm run lint` → PASS.
- [ ] **Step 5: Commit** `feat: send failure alerts to notification handles`

### Task 8: Integration page shell, routing, Members and Settings tabs

Load `apollo-vue:vue-best-practices`, `apollo-flavor:ui` and `apollo-flavor:accessibility` before writing Vue.

**Files:**
- Create: `apps/web/src/composables/useIntegrationApps.ts`
- Create: `apps/web/src/views/IntegrationPage.vue`
- Create: `apps/web/src/components/members/IntegrationMembers.vue` (body of today's `IntegrationUsersPage.vue`)
- Create: `apps/web/src/components/integrations/IntegrationSettings.vue` (rename, leave, delete — from `IntegrationHeader.vue` and its dialogs)
- Delete: `apps/web/src/views/IntegrationUsersPage.vue`
- Modify: `apps/web/src/router/index.ts`
- Modify: `apps/web/src/views/IntegrationsPage.vue` (list of links; keeps create dialog and the GitHub App install callback / `GitHubAppLinkDialog`)
- Modify: `apps/web/src/composables/useIntegrationCrud.ts` as needed
- Test: `apps/web/src/views/IntegrationPage.test.ts`

**Interfaces:**
- `useIntegrationApps()` returns `{listApps(integrationId): Promise<IntegrationApp[]>, installApp(integrationId, type), uninstallApp(integrationId, appId), createHandle(integrationId, appId, {name, url}), updateHandle(integrationId, handleId, {name?, url?}), deleteHandle(integrationId, handleId)}` — same `fetchWithAuth` + `parseApiResponse` pattern as `useIntegration.ts`.
- Routes: `integrations/:integrationId` → redirect to `integrations/:integrationId/apps`; `integrations/:integrationId/:tab(apps|members|settings)` → `IntegrationPage.vue` (name `integration`, title from the integration label); `integrations/:integrationId/users` → redirect to `…/members`.
- `IntegrationPage.vue`: breadcrumb `Integrations › <label>`, `<h1>` label, meta line (owner, member count), tabs via `components/ui/Tabs*` synced to the `tab` param. On widths < 640 px the Rename button is hidden from the header (it lives in Settings).

- [ ] **Step 1: Failing tests** in `IntegrationPage.test.ts` (mount with a memory router):
  - `renders Apps, Members and Settings tabs and selects the tab from the route`.
  - `redirects /integrations/:id/users to the members tab` (router test).
  - `hides Rename, Leave and Delete in Settings for a viewer`.
- [ ] **Step 2:** `cd apps/web && pnpm run test:run` → FAIL.
- [ ] **Step 3:** Implement; the list page links each integration to `/integrations/:id/apps`.
- [ ] **Step 4:** `pnpm run test:run && pnpm run lint && npx vue-tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat: add a page per integration with tabs`

### Task 9: Apps tab

Load the same skills as Task 8. Layout reference: `docs/superpowers/specs/2026-10-25-integration-apps-mockup.html`.

**Files:**
- Create: `apps/web/src/components/apps/AppsTab.vue`, `AppCard.vue`, `AppCatalog.vue`, `GithubAppPanel.vue`, `WebhookAppPanel.vue`, `HandleDialog.vue`, `DeleteHandleDialog.vue`, `UninstallAppDialog.vue`
- Modify/move: `WebhookCredentials.vue`, `WebhookEventEditor.vue`, `OrgSyncSettings.vue`, `GitHubInstallation.vue`, `RotateSecretDialog.vue`, `UnlinkInstallationDialog.vue` are reused by `GithubAppPanel.vue`; `IntegrationCard.vue` is deleted.
- Modify: `packages/db/src/types/entities.ts` and `apps/lambdas/api/src/domains/integrations/integrations.controller.ts` (`getIntegrations`): pass `columns: {secret: false, orgSyncDefaultRole: false}` as a sibling of `with` in the `findMany` call **and** in the `BuildQueryResult` config of `Integration`, so `GET /api/integrations` stops returning the secret to every member. Done here because this task removes the last web reader (`IntegrationCard.vue`).
- Test: `apps/web/src/components/apps/WebhookAppPanel.test.ts`, `AppsTab.test.ts`

**Interfaces:**
- `AppsTab.vue` props `{integration: IntegrationWithRole}`; loads apps with `useIntegrationApps().listApps`.
- Installed section: one `AppCard` per installed app (icon, name, one-line description, stats: GitHub = installations (`integration.githubAppInstallations.length` from the prop) · org sync default role; Webhook = handles · sum of `ruleCount`). The mockup's repo count is dropped. Clicking opens the panel below the grid.
- Catalog section: `github` / `webhook` if not installed (Install button, admin only), plus Slack, GitLab, Jira as disabled cards labelled "Coming later".
- `GithubAppPanel`: everything `IntegrationCard.vue` showed (webhook URL + secret with rotate, events editor, org sync role, installations with unlink), secret masked when `null`; "Remove GitHub app" (admin) with a dialog stating that collected data is kept and ingest stops.
- `WebhookAppPanel`: handle list (name, host from the URL or "hidden", rule count, actions menu for admins), "Add handle" (admin) opens `HandleDialog` (name + Slack webhook URL, inline validation: `https://hooks.slack.com/...`); delete warns when `ruleCount > 0` that the rules will stop sending to it.
- Phone (< 640 px): cards one column, handle rows two lines (name + rule count, then host), "Add handle" full width.

- [ ] **Step 1: Failing tests:**
  - `WebhookAppPanel.test.ts`: `viewer sees handle names but no URL and no Add handle button`; `admin adding a non-Slack URL sees a validation error and no request is sent`; `deleting a handle used by rules shows the warning with the rule count`.
  - `AppsTab.test.ts`: `shows Slack, GitLab and Jira as coming later and not installable`; `shows Install for the webhook app when it is not installed (admin only)`.
- [ ] **Step 2:** `cd apps/web && pnpm run test:run` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm run test:run && pnpm run lint && npx vue-tsc --noEmit` → PASS. Run the app (`pnpm run dev`) and check the Apps tab at 1280 px and 390 px against the mockup.
- [ ] **Step 5: Commit** `feat: show installed apps and manage Slack webhook handles`

### Task 10: Rule editor picks a handle

**Files:**
- Modify: `apps/web/src/components/notifications/NotificationDetailsCard.vue` (+ `.test.ts`)
- Modify: `apps/web/src/components/notifications/NotificationCard.vue`
- Modify: `apps/web/src/views/NotificationsPage.vue` (+ `.test.ts`)
- Modify: `apps/web/src/composables/useNotification.ts` if it touches `channels`

**Interfaces:**
- Deliberate v1 call: the API accepts up to 20 `handleIds` per rule, but the editor picks exactly one handle, as today's editor edits only `channels[0]`. Migrated rules with several handles keep them; the editor shows all their names and replaces them with the one selected only when the user changes the selection.
- The editor loads the selected integration's apps (`useIntegrationApps().listApps`), shows an app select (only apps that have handles: `webhook` today) and a handle select; saves `handleIds: [selected]`.
- No Webhook app or no handles → inline message with a link to `/integrations/:id/apps` instead of the selects; Save disabled.
- `NotificationCard.vue` shows handle names (resolved from the loaded apps) instead of `channels[0].type` / URL, and drops the copy-URL button. A rule with `handleIds.length === 0` shows a warning badge "No destination".

- [ ] **Step 1: Failing tests:**
  - `NotificationDetailsCard.test.ts`: replace the URL-input steps with selecting a handle; `saves the selected handle id`; `shows a link to the Apps tab when the integration has no handles`.
  - `NotificationsPage.test.ts`: fixtures use `handleIds`; `shows "No destination" for a rule without handles`.
- [ ] **Step 2:** `cd apps/web && pnpm run test:run` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm run test:run && pnpm run lint && npx vue-tsc --noEmit` → PASS; `grep -rn "webhook_url\|channels" apps/web/src` → no matches.
- [ ] **Step 5: Commit** `feat: pick a notification handle in the rule editor`

### Task 11: Contract migration (after the cutover only)

Run this task only after the runbook from Task 2 has been executed in production and the deploy is healthy.

**Files:**
- Modify: `packages/db/src/schema/github/workflows.ts` (drop `secret`, `orgSyncDefaultRole` from `integrations`)
- Modify: `packages/db/src/schema/gitgazer.ts` (drop `channels` from `notificationRules`)
- Modify: `packages/db/src/types/notifications.ts` (remove `NotificationRuleChannel*`, `isNotificationRuleChannel`; keep `isAllowedWebhookUrl`)
- Modify: `packages/db/src/queries/index.ts` (remove the now-pointless `columns` exclusion)
- Modify: `apps/lambdas/api/src/domains/notifications/notifications.controller.ts` (stop writing `channels: []`)
- Create: generated `packages/db/drizzle/<timestamp>_integration_apps_contract/`

- [ ] **Step 1:** Edit the schema and types; `cd packages/db && npx drizzle-kit generate --name=integration_apps_contract`. The SQL contains exactly three `DROP COLUMN`s and nothing else.
- [ ] **Step 2:** `pnpm nx run-many -t typecheck lint test:unit` → PASS; `grep -rn "orgSyncDefaultRole" packages/db/src/schema/github` → no match.
- [ ] **Step 3: Commit** `refactor: drop integration columns moved to integration apps`
