# MCP write-tool parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give MCP write sessions every safe API write (rename integration, notification handles, webhook events, event-log read state) plus a `list_slack_channels` read tool, and make every API operation explicitly classified as "MCP tool" or "excluded, because …".

**Architecture:** Tools reuse the existing `registerTool` wrapper (caller resolution, `checkAccess` per call, in-band errors) and call the same controller functions as the REST routes. Logic that lives inline in a route moves into a controller first. The GitHub installations table becomes readable by the MCP role, like the other GitHub data tables. An exclusion map in the permission table plus a test keeps parity from drifting.

**Tech Stack:** TypeScript, Hono, `@modelcontextprotocol/server`, zod, Drizzle ORM (Aurora PostgreSQL, RLS), Vitest, PGlite (view tests).

**Spec:** `docs/superpowers/specs/2026-10-30-mcp-write-tool-parity-design.md`

## Global Constraints

- Write tools register only when `write` is true (`registerMcpTools(server, {write})`); `list_slack_channels` registers in both session types.
- Every tool name maps to an existing operation in `TOOLS` (`apps/lambdas/api/src/shared/permissions/table.ts`); no role checks in tool bodies or controllers.
- Integration-scoped tools require `integration_id` and pass `integrationIds: [integration_id]`; the event-log tools pass `Object.keys(caller.integrationRoles)`.
- Changes made through MCP pass `source: 'mcp'`; event-log messages then end with " via MCP". REST wording stays unchanged.
- Event-log entries never contain a full webhook URL, only its host.
- Audit writes for handles run after the write commits and are best-effort (try/catch + `getLogger().error`), like `logRuleChange`.
- No operation on the spec's exclusion list gets a tool.
- Path aliases `@/…` and `@gitgazer/…`; never cross-project relative imports. Comment only a non-obvious why.
- Commits: one-line Conventional Commit messages, no Co-Authored-By / "Generated with" / AI mentions. No `git stash`, no `git add -A`.
- Checks per package before committing: `pnpm exec vitest --project unit --run` (or `pnpm run test:unit`), `pnpm run lint`, `pnpm run pretty:check`, `pnpm run typecheck` where the package has it.

## Review Focus

1. A webhook handle created/updated with a secret-bearing URL (`https://hooks.slack.com/services/T/B/secret`) — the event log must show only `hooks.slack.com`. Test in Task 1.
2. `create_notification_handle` with both `channel_id` and `url`, or with neither — must fail in-band without calling the controller. Test in Task 4.
3. A read-only session — must list `run_sql`, `list_tables`, `describe_table`, `list_slack_channels` and nothing else; calling `delete_notification_handle` by name fails as unknown tool. Test in Task 4.
4. `update_webhook_events` with another integration's installation id — "Installation not found", no GitHub call, no event-log entry. Test in Task 2.
5. `delete_notification_handle` with an unknown id — "Handle not found" in-band, no audit entry. Test in Task 1.

---

### Task 1: Change source + handle audit entries

**Files:**
- Create: `apps/lambdas/api/src/shared/change-source.ts`
- Modify: `apps/lambdas/api/src/domains/notifications/notifications.controller.ts` (import `ChangeSource`/`viaSuffix` from the new file instead of defining them)
- Modify: `apps/lambdas/api/src/domains/apps/apps.controller.ts` (`createHandle`, `updateHandle`, `deleteHandle`)
- Modify: `apps/lambdas/api/src/domains/integrations/integrations.controller.ts` (`upsertIntegration` gains `source?: ChangeSource`)
- Test: `apps/lambdas/api/src/domains/apps/apps.controller.test.ts`, `apps/lambdas/api/src/domains/integrations/integrations.controller.test.ts`

**Interfaces:**
- Produces: `export type ChangeSource = 'mcp'; export const viaSuffix = (source?: ChangeSource): string` in `@/shared/change-source`.
- Produces: `createHandle(params & {source?: ChangeSource})`, `updateHandle(params & {source?: ChangeSource})`, `deleteHandle(params & {source?: ChangeSource})`, `upsertIntegration(params & {source?: ChangeSource})` — return types unchanged.

- [ ] **Step 1: Write failing tests** in `apps.controller.test.ts` (follow its existing mocks for `withRlsTransaction` and `createEventLogEntry`):
  - `createHandle` webhook `{name: 'ops', url: 'https://hooks.slack.com/services/T/B/secret', source: 'mcp'}` → `createEventLogEntry` called once with `category: 'notification'`, a message containing `"ops"`, `hooks.slack.com` and ending in `via MCP`, and **not** containing `secret` or `/services/`.
  - `createHandle` Slack `{channelId}` without source → message contains the channel name and does not contain `via MCP`.
  - `updateHandle` URL change from `https://a.example.com/x` to `https://b.example.com/y` → message contains `a.example.com` and `b.example.com`, not `/x` or `/y`.
  - `updateHandle` name-only change → message contains old and new name.
  - `deleteHandle` existing → message contains the deleted handle's name; unknown id → throws `NotFoundError('Handle not found')` and `createEventLogEntry` not called.
  - `createEventLogEntry` rejecting → `createHandle` still resolves with the handle.
  - In `integrations.controller.test.ts`: `upsertIntegration({id, label: 'New', integrationIds: [id], source: 'mcp'})` → rename entry message ends with ` via MCP`; without source, message unchanged from today.
- [ ] **Step 2: Run** `cd apps/lambdas/api && pnpm exec vitest --project unit --run src/domains/apps src/domains/integrations` — expect the new tests to FAIL.
- [ ] **Step 3: Implement.** Move `ChangeSource`/`viaSuffix` to `@/shared/change-source`. Add one best-effort `logHandleChange` helper in `apps.controller.ts` (title `Notification handle created|updated|deleted`, category `notification`, type `info`, metadata `{integrationId, handleId}`); log `new URL(url).host` only. `deleteHandle` gets the name via `.returning({handleId, name})`; `updateHandle` already loads the old handle via `loadHandle`. Logging happens after `withRlsTransaction` resolves.
- [ ] **Step 4: Run** the same tests — PASS; then lint, pretty:check, typecheck for the api app.
- [ ] **Step 5: Commit** `feat: audit notification handle changes in the event log`

---

### Task 2: Webhook-events controller

**Files:**
- Modify: `apps/lambdas/api/src/domains/integrations/integrations.controller.ts` (new `updateWebhookEvents`)
- Modify: `apps/lambdas/api/src/domains/integrations/integrations.routes.ts` (PATCH `/:integrationId/github-app/:installationId/events` delegates)
- Test: `apps/lambdas/api/src/domains/integrations/integrations.controller.test.ts`, existing `integrations.routes.test.ts`

**Interfaces:**
- Consumes: `ChangeSource`, `viaSuffix` (Task 1).
- Produces: `export const updateWebhookEvents = async (params: {integrationId: string; installationId: number; events: string[]; source?: ChangeSource}): Promise<{events: string[]}>`.

- [ ] **Step 1: Write failing controller tests** (move/adapt the route's existing cases from #1928):
  - events not all in `GITHUB_APP_WEBHOOK_EVENTS` → `BadRequestError` listing allowed events.
  - installation not linked to the integration → `NotFoundError('Installation not found')`, `updateAllWebhookEvents` and `createEventLogEntry` not called.
  - `updateAllWebhookEvents` rejects → failure entry written, error rethrown.
  - success with `source: 'mcp'` → "Webhook events updated" message ends with ` via MCP`; returns `{events}`.
- [ ] **Step 2: Run** the integrations tests — FAIL.
- [ ] **Step 3: Implement** by moving the route body (events validation, ownership select, try/catch, both entries) into `updateWebhookEvents`. The route keeps parsing `installationId` and the JSON body and returns `c.json(await updateWebhookEvents(...))`. Route tests keep passing (adjust mocks only where they mocked internals that moved).
- [ ] **Step 4: Run** api tests, lint, pretty:check, typecheck — PASS.
- [ ] **Step 5: Commit** `refactor: move webhook-events updates into the integrations controller`

---

### Task 3: Make `github.github_app_installations` readable by MCP

**Files:**
- Modify: `packages/db/src/schema/github/workflows.ts` (`githubAppInstallations` gets `mcpTenantSeparationPolicy()`), `packages/db/src/schema/descriptions.ts` (table description)
- Create: `packages/db/drizzle/<timestamp>_mcp_github_app_installations/` (generated, then hand-edited)
- Test: `packages/db/src/queries/mcp-context.test.ts` (or whichever test lists the tables carrying the MCP policy)

Read `.github/skills/db-migration/SKILL.md` first.

**Interfaces:**
- Produces: `gitgazer_mcp` can `SELECT` from `github.github_app_installations`, limited by the "tenant separation mcp" policy to the caller's integrations.

- [ ] **Step 1: Write a failing test** if a test enumerates the MCP-readable tables or their policies (check `mcp-context.test.ts` and `descriptions.test.ts`); add `github_app_installations` to the expectation.
- [ ] **Step 2: Run** `cd packages/db && pnpm exec vitest --run` — FAIL (or note that no test enumerates them).
- [ ] **Step 3: Implement.** Add `mcpTenantSeparationPolicy()` to the table's policy list, extend its description ("…; installation_id is what update_webhook_events takes."), run `npx drizzle-kit generate --name mcp_github_app_installations`, and append to the generated `migration.sql`, separated by `--> statement-breakpoint`:
  ```sql
  GRANT SELECT ON TABLE github.github_app_installations TO gitgazer_mcp;
  ```
  (pattern: `20260721080210_new_mcp_role_grants`, `20260728070749_workable_mordo`). The generated SQL must contain only the new policy; if it contains anything else, stop and report.
- [ ] **Step 4: Run** db tests, lint, prettier check — PASS.
- [ ] **Step 5: Commit** `feat(db): let mcp read github app installations`

---

### Task 4: Handle tools and `list_slack_channels`

**Files:**
- Create: `apps/lambdas/api/src/domains/mcp/mcp.handle-tools.ts`, `apps/lambdas/api/src/domains/mcp/mcp.handle-tools.test.ts`
- Modify: `apps/lambdas/api/src/shared/permissions/table.ts` (`TOOLS`), `apps/lambdas/api/src/domains/mcp/mcp.tools.ts` (registration), `mcp.tools.test.ts`, `mcp.routes.test.ts` (read-session tool lists)

**Interfaces:**
- Consumes: `createHandle`, `updateHandle`, `deleteHandle`, `listSlackChannels` from `@/domains/apps/apps.controller` (Task 1 signatures).
- Produces: `registerHandleTools(server: McpServer): void` (write tools) and `registerSlackChannelTool(server: McpServer): void` (read tool); `TOOLS` entries `create_notification_handle: 'handle.create'`, `update_notification_handle: 'handle.update'`, `delete_notification_handle: 'handle.delete'`, `list_slack_channels: 'slackApp.channels'`.

- [ ] **Step 1: Write failing tests** in `mcp.handle-tools.test.ts` (copy the harness from `mcp.notification-tools.test.ts`):
  - `create_notification_handle` `{integration_id, app_id, channel_id}` → `createHandle({integrationId, integrationIds: [integrationId], appId, channelId, source: 'mcp'})`.
  - `{integration_id, app_id, name, url}` → `createHandle` with `name`, `url`, `source: 'mcp'`.
  - `{…, channel_id, url, name}` and `{integration_id, app_id}` → in-band error (`isError: true`), `createHandle` not called.
  - `update_notification_handle` passes only given fields plus `source: 'mcp'`.
  - `delete_notification_handle` → `deleteHandle(... source: 'mcp')`, returns `{deleted: true, handle_id}`; controller throwing `NotFoundError('Handle not found')` → in-band text `Handle not found`.
  - `list_slack_channels` → `listSlackChannels({integrationId, integrationIds: [integrationId], appId})`.
  - annotations: delete has `destructiveHint: true`; `list_slack_channels` has `readOnlyHint: true`.
  - In `mcp.tools.test.ts` / `mcp.routes.test.ts`: read session lists exactly `['run_sql', 'list_tables', 'describe_table', 'list_slack_channels']`; a read session calling `delete_notification_handle` gets the unknown-tool error (mirror the existing `delete_notification_rule` case).
- [ ] **Step 2: Run** api mcp tests — FAIL.
- [ ] **Step 3: Implement.** Inputs: `integration_id` uuid, `app_id` uuid (describe: "look up app ids and types in gitgazer.integration_apps_view"), `handle_id` uuid ("gitgazer.notification_handles_view"), `channel_id` string ("from list_slack_channels"), `name` string, `url` string (`.url()`). Express the create input as one object schema with optional fields and reject the wrong combinations in the handler with `McpToolError` (simpler for MCP clients than a JSON-schema union). Descriptions say "Requires the admin role in the integration." Delete description: "Rules that send to this handle lose this destination." Register write tools inside `if (write)`, `list_slack_channels` unconditionally.
- [ ] **Step 4: Run** api tests (including `table.test.ts`), lint, pretty:check, typecheck — PASS.
- [ ] **Step 5: Commit** `feat: add notification handle and slack channel mcp tools`

---

### Task 5: Integration and event-log tools

**Files:**
- Create: `apps/lambdas/api/src/domains/mcp/mcp.integration-tools.ts`, `apps/lambdas/api/src/domains/mcp/mcp.integration-tools.test.ts`
- Modify: `apps/lambdas/api/src/shared/permissions/table.ts` (`TOOLS`), `apps/lambdas/api/src/domains/mcp/mcp.tools.ts`

**Interfaces:**
- Consumes: `upsertIntegration` (Task 1), `updateWebhookEvents` (Task 2), `toggleEventLogRead`, `markAllEventLogRead` from `@gitgazer/backend-services/event-log.controller`.
- Produces: `registerIntegrationTools(server: McpServer): void`; `TOOLS` entries `rename_integration: 'integration.rename'`, `update_webhook_events: 'githubApp.updateEvents'`, `set_event_log_read: 'eventLog.markRead'`, `mark_all_event_log_read: 'eventLog.markAllRead'`.

- [ ] **Step 1: Write failing tests:**
  - `rename_integration` `{integration_id, label: ' New '}` → `upsertIntegration({id, label, integrationIds: [id], source: 'mcp'})`; empty label rejected by schema.
  - `update_webhook_events` `{integration_id, installation_id: 7, events: ['workflow_run']}` → `updateWebhookEvents({integrationId, installationId: 7, events, source: 'mcp'})`; an event outside `GITHUB_APP_WEBHOOK_EVENTS` is rejected by the schema (`z.enum`); controller `NotFoundError('Installation not found')` → in-band text.
  - `set_event_log_read` `{id, read: true}` with caller roles for A and B → `toggleEventLogRead({id, integrationIds: [A, B], read: true})`; `null` result → in-band `Event log entry not found`.
  - `mark_all_event_log_read` `{}` → `markAllEventLogRead({integrationIds: [A, B]})`, returns `{updated: n}`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `installation_id` described as "from github.github_app_installations". Register inside `if (write)`.
- [ ] **Step 4: Run** api tests, lint, pretty:check, typecheck — PASS.
- [ ] **Step 5: Commit** `feat: add integration, webhook-events and event-log mcp tools`

---

### Task 6: Exclusion map and parity test

**Files:**
- Modify: `apps/lambdas/api/src/shared/permissions/table.ts`, `apps/lambdas/api/src/shared/permissions/table.test.ts`

**Interfaces:**
- Produces: `export const NOT_IN_MCP = {…} as const satisfies Partial<Record<Operation, string>>` (operation → reason).

- [ ] **Step 1: Write failing tests** in `table.test.ts`:
  - every operation whose `access` is not `'public'` is in exactly one of `Object.values(TOOLS)` or `Object.keys(NOT_IN_MCP)`;
  - no operation is in both;
  - every `NOT_IN_MCP` reason is a non-empty string.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `NOT_IN_MCP` with the spec's exclusion table reasons verbatim for the excluded writes, `'read through run_sql'` for list/stats/get reads, `'browser OAuth flow'` for `slackApp.installCallback`, `slackUser.signInCallback`, `slackApp.install`, `slackUser.connect`, `'accepted in the browser'` for `invitation.accept`, `'session plumbing'` for `auth.logout`, `auth.wsToken`, `user.get`. Use whatever reads exist in `OPERATIONS` at this point (e.g. `member.list`, `app.list`, `slackApp.moveCandidates`).
- [ ] **Step 4: Run** api tests, lint, pretty:check, typecheck — PASS.
- [ ] **Step 5: Commit** `test: classify every api operation as mcp tool or excluded`

---

### Task 7: Instructions and docs

**Files:**
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.server.ts` (`WRITE_INSTRUCTIONS`), `apps/lambdas/api/src/domains/mcp/mcp.tools.ts` (`run_sql` description lists `github_app_installations` among the "github" schema tables)
- Modify: `apps/docs/docs/technical/mcp-server.md`, `apps/docs/docs/technical/roles-and-permissions.md`, `apps/docs/docs/user-guide/ai-assistants.md`

- [ ] **Step 1:** `WRITE_INSTRUCTIONS` names all write tools and where ids come from (`gitgazer.notification_rules_view`, `gitgazer.notification_handles_view`, `gitgazer.integration_apps_view`, `gitgazer.event_log_entries_view`, `github.github_app_installations`), and says members, invitations, app installation and integration create/delete are only possible in the web app. Update any test asserting the instruction text.
- [ ] **Step 2:** Docs: tool table (name, role, session type), the exclusion list with reasons, and in the user guide what a read & write session can and can't do. Note the new handle audit entries in `mcp-server.md`.
- [ ] **Step 3: Run** api tests, lint, pretty:check, typecheck; `pnpm exec prettier --check` on the changed docs.
- [ ] **Step 4: Commit** `docs: describe the mcp write tools and what stays in the web app`

## Deployment note

The Task 3 migration must be applied before the API change deploys (the table is referenced only in descriptions and instructions, so a missing grant breaks nothing at runtime, but agents would fail to query it). Say so in the PR description.
