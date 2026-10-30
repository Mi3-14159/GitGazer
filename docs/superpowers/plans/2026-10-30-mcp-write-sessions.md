# MCP Write Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a read-only or read & write MCP session at connect time, and give write sessions three notification-rule tools.

**Architecture:** The OAuth proxy's authorize step detours through a new web page (`/mcp/connect`) whose form POST adds the `gitgazer-mcp/write` scope only on the user's choice; the choice is bound to the browser by the existing signed-state + `oauthState` nonce cookie mechanism plus a strict `Origin` check. The MCP route builds its server with or without the write tools depending on the token's scopes; each write tool is checked against the permission table on every call and reuses the notification controller.

**Tech Stack:** TypeScript, Hono, `@modelcontextprotocol/server`, zod, Drizzle (Aurora PG, RLS), Vue 3 + Tailwind, Vitest, Terraform (Cognito).

**Spec:** `docs/superpowers/specs/2026-10-30-mcp-write-sessions-design.md`

## Global Constraints

- pnpm monorepo; `@/` aliases inside an app, `@gitgazer/*` for packages, never cross-project relative imports.
- Keep code as simple as possible; mirror the closest existing pattern; comments only for a non-obvious why.
- Vitest with all AWS/DB mocked; never call real services.
- Before reporting a task done, from the touched app's directory: `pnpm run test:unit` (api) or `pnpm run test:run` (web), `pnpm run lint`, `pnpm run pretty:check`, and `pnpm run typecheck` (api). Fix what the change caused.
- Commit messages: one-line Conventional Commits, English, **no** `Co-Authored-By` or AI attribution (a hook rejects them). Stage only the task's files (`git add <paths>`, never `-A`); other sessions may share this checkout, so check `git branch --show-current` is `feat/mcp-write-sessions` before committing.
- Scope strings: read `gitgazer-mcp/read` (existing `MCP_SCOPE`), write `gitgazer-mcp/write`.
- Tool names: `create_notification_rule`, `update_notification_rule`, `delete_notification_rule`.
- UI copy (exact): title "Connect an MCP client"; subtitle "Choose what this client may do"; option "Read only" — "Query workflows, PRs and configuration"; option "Read & write" — "Everything above, plus change notification rules"; button "Allow read access" / "Allow read & write access".
- Role checks only via the permission table (`checkAccess`), never inside controllers or tool bodies.

## Review Focus

- A client that sends `scope=gitgazer-mcp/write`, or no `scope`, to `GET /api/mcp/oauth/authorize` must still end up with read-only scopes (Task 2 test).
- `POST /api/mcp/oauth/authorize` with a missing, `null` or foreign `Origin` is rejected; a callback without the matching `oauthState` cookie is rejected (Task 2 tests).
- A signed connect-request presented as the Cognito `state` (and a web-login/Slack state presented to the MCP callback) is rejected (Task 2 test).
- A read-scope token calling `delete_notification_rule` by name gets an error and nothing is deleted (Task 4 route test).
- `update_notification_rule` with an id that doesn't exist in that integration returns "Notification rule not found" and creates nothing (Task 1 + Task 4 tests).

---

### Task 1: Notification controller — source, partial update, delete result

**Files:**
- Modify: `apps/lambdas/api/src/domains/notifications/notifications.controller.ts`
- Modify: `apps/lambdas/api/src/domains/notifications/notifications.routes.ts` (only if the delete signature change needs it)
- Test: `apps/lambdas/api/src/domains/notifications/notifications.controller.test.ts`

**Interfaces:**
- Produces:
  - `type ChangeSource = 'mcp'` (exported).
  - `upsertNotificationRule(params: {rule: NotificationRuleUpdate; integrationId: string; createOnly?: boolean; ruleId?: string; source?: ChangeSource}): Promise<NotificationRule>` — unchanged behaviour; with `source: 'mcp'` the event-log message ends the "was created/updated" phrase with " via MCP" (e.g. `… was updated via MCP (destinations: 1, enabled: true)`).
  - `updateNotificationRule(params: {integrationId: string; ruleId: string; changes: Partial<NotificationRuleUpdate>; source?: ChangeSource}): Promise<NotificationRule>` — new.
  - `deleteNotificationRule(ruleId: string, integrationId: string, source?: ChangeSource): Promise<boolean>` — `true` when a row was deleted.

- [ ] **Step 1: Write failing tests** in `notifications.controller.test.ts`, following the file's existing mock style:
  - `upsertNotificationRule with source mcp says "via MCP" in the event log` — message contains `was created via MCP`.
  - `updateNotificationRule merges changes into the stored rule` — stored rule `{label: 'Alerts', enabled: true, ignore_dependabot: true, include_log_details: false, rule: {owner: 'o'}, handleIds: ['h-1']}`, changes `{enabled: false}` → written values have `enabled: false`, `label: 'Alerts'`, `rule: {owner: 'o'}`, destinations re-inserted with `h-1`; returned rule has `enabled: false`.
  - `updateNotificationRule replaces the rule filter as a whole` — changes `{rule: {repository_name: 'r'}}` → written `rule` equals `{repository_name: 'r'}`.
  - `updateNotificationRule throws NotFoundError when the rule does not exist` — load returns no row → rejects with `NotFoundError` message `Notification rule not found`; no insert, no event-log entry.
  - `updateNotificationRule rejects an invalid merged rule` — changes `{label: ''}` → `BadRequestError`.
  - `deleteNotificationRule returns false and writes no event log when nothing was deleted`.
  - `deleteNotificationRule returns true and logs "via MCP" with source mcp`.
- [ ] **Step 2: Run** `cd apps/lambdas/api && pnpm vitest run src/domains/notifications/notifications.controller.test.ts` — new tests FAIL.
- [ ] **Step 3: Implement.**
  - Extract the body of `upsertNotificationRule`'s transaction (handle check, insert/onConflict, destinations replace) into a module-private `writeRule(tx, …)` used by both upsert and update, and the event-log block into a private helper taking `action` and `source`.
  - `updateNotificationRule` runs in one `withRlsTransaction` with `userName: gitgazerWriter.name`: `tx.select().from(notificationRules).where(and(eq(id), eq(integrationId))).for('update')`; no row → `NotFoundError('Notification rule not found')`; load the rule's destination handle ids; merge `{label, handleIds, enabled, ignore_dependabot, include_log_details, rule}` with `changes` (shallow; a given `rule` replaces the stored one); validate with `isNotificationRuleUpdate` → `BadRequestError('Invalid notification rule update')`; `writeRule`. Event log as "updated" after the transaction.
  - `deleteNotificationRule` uses `.returning({id: notificationRules.id})`; writes the event-log entry only when a row was deleted; returns whether one was. The REST delete route keeps its response as is.
- [ ] **Step 4: Run** the test file — PASS; then the api checks from Global Constraints.
- [ ] **Step 5: Commit** `feat: add partial update and delete result to the notification rule controller`.

---

### Task 2: OAuth connect flow — scopes, connect hand-off, confirm endpoint, bound callback, Cognito scope

**Files:**
- Modify: `apps/lambdas/api/src/shared/mcp-scope.ts`
- Modify: `apps/lambdas/api/src/domains/mcp/mcp-oauth.controller.ts`
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.controller.ts` (`buildProtectedResourceMetadata` scopes)
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.routes.ts` (GET authorize, new POST authorize, callback cookie)
- Modify: `apps/lambdas/api/src/domains/auth/auth.helpers.ts` (add `isAllowedFrontendOrigin`)
- Modify: `apps/lambdas/api/src/shared/permissions/table.ts` (route entry)
- Modify: `infra/cognito.tf`
- Test: `apps/lambdas/api/src/domains/mcp/mcp-oauth.controller.test.ts`, `mcp.metadata.test.ts`, `mcp.controller.test.ts`, `mcp.routes.test.ts`, `apps/lambdas/api/src/domains/auth/auth.helpers.test.ts` (create if absent)

**Interfaces:**
- Consumes: `mintSignedState`, `verifySignedState` (`@/domains/auth/auth.controller`); `buildStateCookie`, `buildClearStateCookie`, `extractTokenFromCookies`, `getRequestCookies`, `OAUTH_STATE_COOKIE_NAME` (`@/shared/helpers/cookies`).
- Produces:
  - `mcp-scope.ts`: `MCP_SCOPE = 'gitgazer-mcp/read'`, `MCP_WRITE_SCOPE = 'gitgazer-mcp/write'`, `CLIENT_SCOPES = ['openid', 'email', 'profile', MCP_SCOPE]`, `ADVERTISED_SCOPES = [...CLIENT_SCOPES, MCP_WRITE_SCOPE]`.
  - `isAllowedFrontendOrigin(origin: string | undefined): boolean` — false for undefined, `'null'`, unparsable, or not in `allowedFrontendOrigins`.
  - `handleAuthorize(requestOrigin, q): string` — now returns `${mcpOrigin(requestOrigin)}/mcp/connect?request=<signed connect-request>`.
  - `handleAuthorizeConfirm(requestOrigin: string, origin: string | undefined, form: {request?: string; session?: string}): {location: string; stateCookie: string}`.
  - `handleCallback(requestOrigin: string, q: Record<string, string>, nonceFromCookie: string | null): string`.
  - Web page contract (Task 3): `GET /mcp/connect?request=<opaque>`; the page form-POSTs `application/x-www-form-urlencoded` fields `request` (unchanged) and `session` (`read` | `write`) to `POST /api/mcp/oauth/authorize`.

- [ ] **Step 1: Write failing tests.**
  - `mcp-oauth.controller.test.ts` (update existing `handleAuthorize`/`handleCallback` tests to the new shapes; add `allowedFrontendOrigins: ['https://app.gitgazer.com']` to the config mock):
    - `handleAuthorize redirects to the connect page with a signed request` — Location origin+path `https://app.gitgazer.com/mcp/connect`, has `request`.
    - `handleAuthorize never lets the client request the write scope` — for `scope` of `gitgazer-mcp/write`, `''`, `undefined`, and `openid gitgazer-mcp/write`, confirming with `session: 'read'` yields a Cognito `scope` without `gitgazer-mcp/write` and with `gitgazer-mcp/read`.
    - `handleAuthorizeConfirm redirects to Cognito with PKCE, our callback and a bound state` — `session: 'read'`; Cognito URL has `client_id`, `redirect_uri` = our callback, `code_challenge`, `identity_provider=Github`; `stateCookie` starts with `oauthState=`.
    - `handleAuthorizeConfirm adds the write scope only for session write`.
    - `handleAuthorizeConfirm rejects a missing, null or foreign Origin` — `undefined`, `'null'`, `'https://evil.example'` → `ForbiddenError`.
    - `handleAuthorizeConfirm rejects a tampered, expired or missing request, and an unknown session` → `BadRequestError`.
    - `handleCallback relays the code when the cookie nonce matches` — build state via `handleAuthorizeConfirm`, take nonce from its cookie.
    - `handleCallback rejects a missing or different cookie nonce`.
    - `handleCallback rejects a connect-request used as state, and a state minted for another purpose` — e.g. `mintSignedState({purpose: 'slack_install', …})` and `mintSignedState({redirect_url: …})`.
    - Keep the existing redirect-allowlist and PKCE tests passing against `handleAuthorize`.
  - `mcp.metadata.test.ts` / `mcp.controller.test.ts` / AS-metadata test: `scopes_supported` now `['openid', 'email', 'profile', 'gitgazer-mcp/read', 'gitgazer-mcp/write']`.
  - `auth.helpers` test: `isAllowedFrontendOrigin` true for an allowed origin, false for `undefined`, `'null'`, `'not a url'`, a foreign origin.
  - `mcp.routes.test.ts`: `POST /api/mcp/oauth/authorize` answers 303 with `Location` on the Cognito domain and a `Set-Cookie: oauthState=…`; `GET /api/mcp/oauth/callback` without the cookie answers 400; with it answers 302 and clears the cookie (`Max-Age=0`).
- [ ] **Step 2: Run** the touched test files — FAIL.
- [ ] **Step 3: Implement.**
  - Rename `signProxyState`/`verifyProxyState` to `signConnectRequest`/`verifyConnectRequest`; payload `{purpose: 'mcp_connect', redirectUri, clientState, codeChallenge, scopes: string[], exp, nonce}`; verify checks purpose, expiry and the redirect allowlist.
  - `handleAuthorize`: same validation as today; clamp `q.scope` to `CLIENT_SCOPES` (default `CLIENT_SCOPES`, always add `MCP_SCOPE`); return the connect page URL.
  - `handleAuthorizeConfirm`: `isAllowedFrontendOrigin(origin)` else `ForbiddenError('Origin not allowed')`; verify request else `BadRequestError('Invalid or expired connect request')`; `session` must be `read`/`write` else `BadRequestError`; `mintSignedState({purpose: 'mcp_authorize', redirectUri, clientState, write})`; build the Cognito URL as today's `handleAuthorize` did (scopes from the request, plus `MCP_WRITE_SCOPE` when write); return `{location, stateCookie: buildStateCookie(nonce)}`.
  - `handleCallback`: `verifySignedState` with the cookie nonce, require `purpose === 'mcp_authorize'` and an allowlisted `redirectUri`, else `BadRequestError('Invalid or expired OAuth state')`; relay as today.
  - Routes: `router.post('/oauth/authorize', …)` reads `await c.req.parseBody()` and `c.req.header('origin')`, answers 303 with `Location`, `Set-Cookie` and `Cache-Control: no-store` (one `Set-Cookie` header per cookie, as in `auth.routes.ts`); callback reads the nonce with `extractTokenFromCookies(getRequestCookies(c), OAUTH_STATE_COOKIE_NAME)` and appends `buildClearStateCookie()`.
  - `table.ts`: `'POST /api/mcp/oauth/authorize': 'mcp.oauthAuthorizeConfirm'` with `'mcp.oauthAuthorizeConfirm': {access: 'public'}`.
  - Metadata (`buildAuthServerMetadata`, `buildProtectedResourceMetadata`): `scopes_supported: [...ADVERTISED_SCOPES]`.
  - `infra/cognito.tf`: second `scope` block on `aws_cognito_resource_server.mcp` (`scope_name = "write"`, `scope_description = "Change GitGazer configuration through the MCP server"`); add `"${aws_cognito_resource_server.mcp.identifier}/write"` to the MCP client's `allowed_oauth_scopes`; update the comment above the resource server. Run `terraform fmt` in `infra/`.
- [ ] **Step 4: Run** tests — PASS; api checks; `cd infra && terraform fmt -check`.
- [ ] **Step 5: Commit** `feat: let the mcp oauth proxy ask for the session type before login`.

---

### Task 3: Web connect page

**Files:**
- Create: `apps/web/src/views/McpConnectPage.vue`
- Modify: `apps/web/src/router/index.ts`
- Test: `apps/web/src/views/McpConnectPage.test.ts`

**Interfaces:**
- Consumes: Task 2 page contract; `import.meta.env.VITE_REST_API_ENDPOINT` (form action `${API_ENDPOINT}/mcp/oauth/authorize`).

Load `apollo-flavor:ui`, `apollo-flavor:accessibility` and `apollo-vue:vue-best-practices` before writing the component.

- [ ] **Step 1: Write failing tests** (`@vue/test-utils`, mount with a router or stub `useRoute`):
  - `preselects read only and labels the button "Allow read access"`.
  - `switches the button to "Allow read & write access" when read & write is chosen`.
  - `posts the request and session to the authorize endpoint` — form `method="post"`, `action` ends with `/mcp/oauth/authorize`, hidden `request` input equals the query value, radio `name="session"` values `read`/`write`.
  - `shows an error instead of the form when the request is missing` — text "This link is incomplete. Start the connection from your MCP client again."; no form.
- [ ] **Step 2: Run** `cd apps/web && pnpm vitest run src/views/McpConnectPage.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Layout and components like `Login.vue` (centered, `AppLogo`, `max-w-sm`, `Card`, `Button`); a native `<form>` (a real navigation, so the 303 and cookie work); `<fieldset>` with a visually-hidden or visible `<legend>`; each option is a `<label>` card wrapping a native radio, with the copy from Global Constraints and the tool list (read: `run_sql`, `list_tables`, `describe_table`; write: "create / update / delete notification rules", "needs the member role in that integration"); selected card highlighted. Route `/mcp/connect`, name `mcp-connect`, `meta: {title: 'Connect an MCP client'}`, top-level like `/invite/:token`, lazy-loaded.
- [ ] **Step 4: Run** test — PASS; web checks.
- [ ] **Step 5: Commit** `feat: add the mcp connect page for choosing the session type`.

---

### Task 4: Write tools and per-session tool sets

**Files:**
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.tools.ts`
- Create: `apps/lambdas/api/src/domains/mcp/mcp.notification-tools.ts`
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.server.ts`
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.routes.ts`
- Modify: `apps/lambdas/api/src/shared/permissions/table.ts`
- Test: `mcp.tools.test.ts`, create `mcp.notification-tools.test.ts`, `mcp.routes.test.ts`, `shared/permissions/table.test.ts`

**Interfaces:**
- Consumes: Task 1 controller functions; `MCP_WRITE_SCOPE` (Task 2).
- Produces:
  - `registerTool` exported from `mcp.tools.ts`, config gains optional `annotations: ToolAnnotations` (default `{readOnlyHint: true}`).
  - `registerMcpTools(server: McpServer, options: {write: boolean}): void` — read tools always, plus `registerNotificationRuleTools(server)` when `write`.
  - `createMcpServer(options: {write: boolean}): McpServer`.
  - `TOOLS` adds `create_notification_rule: 'notificationRule.create'`, `update_notification_rule: 'notificationRule.update'`, `delete_notification_rule: 'notificationRule.delete'`.

- [ ] **Step 1: Write failing tests.**
  - `mcp.tools.test.ts`: existing "registers exactly the read-only tools" uses `{write: false}`; new `registers the notification-rule tools in a write session` → keys are the three read tools followed by the three write tools; annotations: create/update `readOnlyHint: false`, delete `readOnlyHint: false, destructiveHint: true`.
  - `mcp.notification-tools.test.ts` (mock `@/domains/notifications/notifications.controller` and `checkAccess` like `mcp.tools.test.ts`):
    - `create_notification_rule calls upsert with createOnly and source mcp` — args `{integration_id, label: 'CI', handle_ids: [H], enabled: true, ignore_dependabot: false, rule: {owner: 'o'}}` → `upsertNotificationRule({rule: {label: 'CI', handleIds: [H], enabled: true, ignore_dependabot: false, rule: {owner: 'o'}}, integrationId, createOnly: true, source: 'mcp'})`; result text is the saved rule JSON.
    - `update_notification_rule passes only the given fields` — `{integration_id, rule_id, enabled: false}` → `updateNotificationRule({integrationId, ruleId, changes: {enabled: false}, source: 'mcp'})`.
    - `delete_notification_rule reports not found` — controller resolves `false` → `isError`, text `Notification rule not found`.
    - `checks the tool operation with the integration id` — `checkAccess` called with `'notificationRule.delete'` and the id; denied → `isError` with the denial message, controller not called.
    - `returns 4xx error messages and hides other errors` — controller rejects `BadRequestError('Unknown notification handle')` → that text; rejects `new Error('db down')` → `Tool execution failed`.
    - Schema: every write tool's `inputSchema.safeParse` fails without `integration_id`; create fails with 21 handle ids or a 101-char label.
  - `mcp.routes.test.ts`: `tools/list with a write-scope token lists six tools`; `tools/list with a read token lists three`; `tools/call delete_notification_rule with a read token is an error and calls no controller` (mock the controller module).
  - `table.test.ts`: call `registerMcpTools(fake, {write: true})`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - `registerTool`: annotations param; `isSafeError` also accepts `HttpError` with `statusCode < 500`.
  - `mcp.notification-tools.ts`: zod schemas — `integration_id: z.string().uuid()`, `rule_id: z.string().uuid()`, `label: z.string().trim().min(1).max(100)`, `handle_ids: z.array(z.string().uuid()).max(20)`, `enabled`/`ignore_dependabot: z.boolean()`, `include_log_details: z.boolean().optional()`, `rule: z.object({owner, repository_name, workflow_name, head_branch: z.string().optional(), topics: z.array(z.string().max(100)).max(50).optional()})`. Create requires all but `include_log_details`; update requires `integration_id`, `rule_id`, the rest optional; delete takes `integration_id`, `rule_id`. Map `handle_ids` → `handleIds`. Delete returning `false` → `NotFoundError('Notification rule not found')`; success returns `{deleted: true, rule_id}`. Descriptions say to look up rule ids in `gitgazer.notification_rules_view` and handle ids in `gitgazer.notification_handles_view` via `run_sql`, and that the member role is needed.
  - `mcp.server.ts`: `createMcpServer({write})`; append one sentence to `INSTRUCTIONS` when `write`: "This session can change notification rules with create_notification_rule, update_notification_rule and delete_notification_rule; look up rule ids in gitgazer.notification_rules_view and destination handle ids in gitgazer.notification_handles_view."
  - `mcp.routes.ts`: two module-level handlers (`read`/`write`) from `createMcpHandler(() => createMcpServer({write}), …)`; pick by `auth.scopes.includes(MCP_WRITE_SCOPE)`; the legacy branch uses the same flag.
- [ ] **Step 4: Run** — PASS; api checks.
- [ ] **Step 5: Commit** `feat: add notification rule write tools to mcp write sessions`.

---

### Task 5: Documentation

**Files:**
- Modify: `apps/docs/docs/user-guide/ai-assistants.md`, `apps/docs/docs/technical/mcp-server.md`, `apps/docs/docs/technical/authentication.md`, `apps/docs/docs/technical/roles-and-permissions.md`

Load `documentation-writer` (`.github/skills/documentation-writer/SKILL.md`) first.

- [ ] **Step 1:** User guide: replace the "Read-only" note with the two session types; describe the connect screen (option names and button labels from Global Constraints); what a write session can do and that it needs the member role; existing connections stay read-only — reconnect (remove and re-add the server, or sign out of it in the client) to choose read & write.
- [ ] **Step 2:** Technical docs: the connect flow (GET authorize → `/mcp/connect` → POST authorize → Cognito → callback), the binding (signed state with purpose `mcp_authorize`, `oauthState` cookie, strict `Origin`), the two scope lists, per-session tool sets, the three write tools with their permission-table operations and annotations, "via MCP" event-log entries. Update any mermaid diagram that shows the MCP OAuth flow.
- [ ] **Step 3:** `cd apps/docs && pnpm run build` passes; `pnpm prettier --check` on the changed files from the repo root.
- [ ] **Step 4: Commit** `docs: document mcp read and write sessions`.
