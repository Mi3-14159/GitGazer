# Permission Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-route `requireRole` with one permission table that an `authorize` middleware checks on every API request and the MCP tool wrapper checks on every tool call.

**Architecture:** A typed table maps every route (`METHOD /pattern`) and every MCP tool name to an operation, and every operation to an access level. `checkAccess` compares a caller's role with an operation's level, logs `authz` and returns a decision. The `authorize` middleware (mounted after `authenticate`) and `registerTool` turn a refusal into a 403 or an in-band tool error. Behaviour of the API stays exactly as today.

**Tech Stack:** TypeScript, Hono 4.13 (`hono/route` `matchedRoutes`), Vitest, `@modelcontextprotocol/server`.

**Spec:** `docs/superpowers/specs/2026-10-30-permission-table-design.md`

## Global Constraints

- Access levels are exactly `'public' | 'authenticated' | {minRole: MemberRole}`; operation names read `resource.action`.
- Refusal responses stay exactly `403 Not a member of this integration` and `403 Insufficient permissions` (`ForbiddenError`).
- `authz` log fields stay `userId`, `integrationId`, `role`, `minimumRole`, `action`, `allowed`, `reason`; `action` becomes the operation name. Denials log at `info`, allows at `debug`, as today.
- Unknown paths keep answering 404; unauthenticated requests outside `publicPrefixes` keep getting 401 from `authenticate`.
- `'authenticated'` never refuses; `authenticate` and `publicPrefixes` are not changed.
- After the work, `requireRole` does not exist and no route declares a role.
- Keep the code as simple as possible: the smallest change that meets each task, no speculative options or layers.
- Commits: one-line Conventional Commit subjects without scope or trailers (e.g. `feat: add the permission table`).

## Review Focus

- CORS preflight (`OPTIONS`) to a role-protected route must still get the CORS response, not 401/403 — pinned in Task 2.
- A trailing slash (`/api/integrations/`, the app is `strict: false`) must resolve to the same entry as without it — pinned in Task 2.
- `:integrationId` under a nested mount (`/api/integrations/:integrationId/apps/:appId`) must be read from the right path segment — pinned in Task 2.
- A role-protected request by a user who belongs to other integrations but not this one must get `403 Not a member of this integration` — pinned in Task 1 and Task 2.
- A `HEAD` request to a `GET` route must use the `GET` entry — pinned in Task 2.

---

## File Structure

- Create `apps/lambdas/api/src/shared/permissions/table.ts` — `Access`, `OPERATIONS`, `Operation`, `ROUTES`, `TOOLS`, `ToolName`. Data only.
- Create `apps/lambdas/api/src/shared/permissions/check-access.ts` — `checkAccess`, `AccessCaller`, `AccessDecision`, `forbiddenFor`.
- Create `apps/lambdas/api/src/shared/middleware/authorization.ts` — `authorize` middleware.
- Create tests next to each: `check-access.test.ts`, `authorization.test.ts`, `table.test.ts` (completeness).
- Modify `apps/lambdas/api/src/app.ts`, `shared/hono/test-request.ts`, every `domains/*/*.routes.ts` that uses `requireRole`, `domains/integrations/integrations.middleware.ts`, `domains/apps/slack-install.ts`, `domains/slack/connect.ts`, `domains/mcp/mcp.tools.ts`, `packages/backend-core/src/types.ts` (comment on `role`).
- Delete `apps/lambdas/api/src/shared/middleware/require-role.ts` and its test.
- Docs: `apps/docs/docs/technical/roles-and-permissions.md`, `authentication.md`, `.github/instructions/backend.instructions.md`, `.github/skills/new-domain/` (SKILL.md and both templates) wherever they mention `requireRole`.

---

### Task 1: Permission table and `checkAccess`

**Files:**

- Create: `apps/lambdas/api/src/shared/permissions/table.ts`
- Create: `apps/lambdas/api/src/shared/permissions/check-access.ts`
- Test: `apps/lambdas/api/src/shared/permissions/check-access.test.ts`

**Interfaces:**

- Produces:
    - `type Access = 'public' | 'authenticated' | {minRole: MemberRole}`
    - `const OPERATIONS: Record<string, {access: Access; checkedInHandler?: true}>` (declared `as const satisfies …`), `type Operation = keyof typeof OPERATIONS`
    - `const ROUTES: Record<string, Operation>` keyed `'<METHOD> <hono pattern>'`, e.g. `'DELETE /api/integrations/:integrationId'`
    - `const TOOLS = {run_sql: 'mcp.runSql', list_tables: 'mcp.listTables', describe_table: 'mcp.describeTable'} as const satisfies Record<string, Operation>`, `type ToolName = keyof typeof TOOLS`
    - `type AccessCaller = {userId: number; integrationRoles: Record<string, MemberRole>}`
    - `type AccessDecision = {allowed: true; role?: MemberRole} | {allowed: false; reason: 'not a member' | 'insufficient role'}`
    - `checkAccess(caller: AccessCaller, operation: Operation, integrationId?: string): AccessDecision`
    - `forbiddenFor(decision: {allowed: false; reason: …}): ForbiddenError` — `'not a member'` → `Not a member of this integration`, `'insufficient role'` → `Insufficient permissions`

- [ ] **Step 1: Write the table** in `table.ts` with exactly these entries (operation → access; routes and tools map to them). The access values reproduce today's `requireRole` calls and `publicPrefixes`.

| Route                                                                                                                                       | Operation                                                                                        | Access                     |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| `GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/refresh`                                                                   | `auth.login`, `auth.callback`, `auth.refresh`                                                    | public                     |
| `POST /api/auth/cognito/token`, `GET /api/auth/cognito/user`                                                                                | `auth.cognitoToken`, `auth.cognitoUser`                                                          | public                     |
| `POST /api/import/:integrationId`                                                                                                           | `webhook.import`                                                                                 | public                     |
| `POST /api/github/webhook`                                                                                                                  | `githubApp.webhook`                                                                              | public                     |
| `POST /api/mcp`, `POST /api/mcp/oauth/register`, `GET /api/mcp/oauth/authorize`, `GET /api/mcp/oauth/callback`, `POST /api/mcp/oauth/token` | `mcp.endpoint`, `mcp.oauthRegister`, `mcp.oauthAuthorize`, `mcp.oauthCallback`, `mcp.oauthToken` | public                     |
| `GET /.well-known/oauth-protected-resource`, `GET /.well-known/oauth-authorization-server`                                                  | `mcp.protectedResourceMetadata`, `mcp.authorizationServerMetadata`                               | public                     |
| `GET /fe-failover/:path{.+}`                                                                                                                | `web.failover`                                                                                   | public                     |
| `GET /api/auth/logout`, `GET /api/auth/ws-token`, `GET /api/user`                                                                           | `auth.logout`, `auth.wsToken`, `user.get`                                                        | authenticated              |
| `POST /api/invitations/accept`                                                                                                              | `invitation.accept`                                                                              | authenticated              |
| `GET /api/integrations`, `POST /api/integrations`                                                                                           | `integration.list`, `integration.create`                                                         | authenticated              |
| `GET /api/workflows`, `GET /api/workflows/filter-values`, `GET /api/overview`                                                               | `workflow.list`, `workflow.filterValues`, `overview.get`                                         | authenticated              |
| `GET /api/metrics/widget`, `GET /api/metrics/repositories`, `GET /api/metrics/topics`                                                       | `metrics.widget`, `metrics.repositories`, `metrics.topics`                                       | authenticated              |
| `GET /api/event-log`, `GET /api/event-log/stats`, `PATCH /api/event-log/:id/read`, `POST /api/event-log/mark-all-read`                      | `eventLog.list`, `eventLog.stats`, `eventLog.markRead`, `eventLog.markAllRead`                   | authenticated              |
| `GET /api/notifications`                                                                                                                    | `notificationRule.list`                                                                          | authenticated              |
| `PUT /api/integrations/:integrationId`                                                                                                      | `integration.rename`                                                                             | admin                      |
| `DELETE /api/integrations/:integrationId`                                                                                                   | `integration.delete`                                                                             | owner                      |
| `POST /api/integrations/:integrationId/rotate-secret`                                                                                       | `githubApp.rotateSecret`                                                                         | admin                      |
| `POST /api/integrations/:integrationId/github-app`                                                                                          | `githubApp.linkInstallation`                                                                     | admin                      |
| `DELETE /api/integrations/:integrationId/github-app/:installationId`                                                                        | `githubApp.unlinkInstallation`                                                                   | admin                      |
| `PATCH /api/integrations/:integrationId/github-app/:installationId/events`                                                                  | `githubApp.updateEvents`                                                                         | admin                      |
| `PATCH /api/integrations/:integrationId/org-sync-settings`                                                                                  | `githubApp.updateOrgSync`                                                                        | admin                      |
| `GET /api/integrations/:integrationId/members`                                                                                              | `member.list`                                                                                    | viewer                     |
| `PATCH /api/integrations/:integrationId/members/:userId/role`                                                                               | `member.changeRole`                                                                              | admin                      |
| `DELETE /api/integrations/:integrationId/members/:userId`                                                                                   | `member.remove`                                                                                  | admin                      |
| `POST /api/integrations/:integrationId/leave`                                                                                               | `member.leave`                                                                                   | viewer                     |
| `GET /api/integrations/:integrationId/invitations`                                                                                          | `invitation.list`                                                                                | member                     |
| `POST /api/integrations/:integrationId/invitations`                                                                                         | `invitation.create`                                                                              | admin                      |
| `POST /api/integrations/:integrationId/invitations/:invitationId/resend`                                                                    | `invitation.resend`                                                                              | admin                      |
| `DELETE /api/integrations/:integrationId/invitations/:invitationId`                                                                         | `invitation.revoke`                                                                              | admin                      |
| `GET /api/integrations/:integrationId/apps`                                                                                                 | `app.list`                                                                                       | viewer                     |
| `POST /api/integrations/:integrationId/apps`                                                                                                | `app.install`                                                                                    | admin                      |
| `DELETE /api/integrations/:integrationId/apps/:appId`                                                                                       | `app.remove`                                                                                     | admin                      |
| `GET /api/integrations/:integrationId/apps/slack/install`                                                                                   | `slackApp.install`                                                                               | admin                      |
| `GET /api/integrations/:integrationId/apps/slack/move-candidates`                                                                           | `slackApp.moveCandidates`                                                                        | admin                      |
| `POST /api/integrations/:integrationId/apps/slack/move`                                                                                     | `slackApp.move`                                                                                  | admin                      |
| `GET /api/integrations/:integrationId/apps/:appId/slack/channels`                                                                           | `slackApp.channels`                                                                              | admin                      |
| `POST /api/integrations/:integrationId/apps/:appId/handles`                                                                                 | `handle.create`                                                                                  | admin                      |
| `PATCH /api/integrations/:integrationId/handles/:handleId`, `DELETE /api/integrations/:integrationId/handles/:handleId`                     | `handle.update`, `handle.delete`                                                                 | admin                      |
| `GET /api/slack/oauth/callback`                                                                                                             | `slackApp.installCallback`                                                                       | admin, `checkedInHandler`  |
| `GET /api/slack/sign-in/callback`                                                                                                           | `slackUser.signInCallback`                                                                       | viewer, `checkedInHandler` |
| `GET /api/integrations/:integrationId/slack/connect`, `DELETE /api/integrations/:integrationId/slack/connection`                            | `slackUser.connect`, `slackUser.disconnect`                                                      | viewer                     |
| `POST /api/integrations/:integrationId/notifications`, `PUT …/notifications/:id`, `DELETE …/notifications/:id`                              | `notificationRule.create`, `notificationRule.update`, `notificationRule.delete`                  | member                     |
| tools `run_sql`, `list_tables`, `describe_table`                                                                                            | `mcp.runSql`, `mcp.listTables`, `mcp.describeTable`                                              | authenticated              |

- [ ] **Step 2: Write the failing tests** in `check-access.test.ts`:

```ts
const caller = (roles: Record<string, MemberRole>) => ({userId: 1, integrationRoles: roles});

it('lets anyone through public and authenticated operations', () => {
    expect(checkAccess(caller({}), 'auth.login')).toEqual({allowed: true});
    expect(checkAccess(caller({}), 'workflow.list')).toEqual({allowed: true});
});
it('allows the minimum role and above', () => {
    expect(checkAccess(caller({i1: 'admin'}), 'integration.rename', 'i1')).toEqual({allowed: true, role: 'admin'});
    expect(checkAccess(caller({i1: 'owner'}), 'integration.rename', 'i1')).toEqual({allowed: true, role: 'owner'});
});
it('refuses a lower role', () => {
    expect(checkAccess(caller({i1: 'member'}), 'integration.rename', 'i1')).toEqual({allowed: false, reason: 'insufficient role'});
});
it('refuses a caller with roles only in other integrations', () => {
    expect(checkAccess(caller({i2: 'owner'}), 'member.list', 'i1')).toEqual({allowed: false, reason: 'not a member'});
});
it('logs denials as authz with the operation as action', () => {
    checkAccess(caller({i1: 'viewer'}), 'integration.delete', 'i1');
    expect(logger.info).toHaveBeenCalledWith('authz', {
        userId: 1,
        integrationId: 'i1',
        role: 'viewer',
        minimumRole: 'owner',
        action: 'integration.delete',
        allowed: false,
        reason: 'insufficient role',
    });
});
it('maps refusals to the existing 403 messages', () => {
    expect(forbiddenFor({allowed: false, reason: 'not a member'}).message).toBe('Not a member of this integration');
    expect(forbiddenFor({allowed: false, reason: 'insufficient role'}).message).toBe('Insufficient permissions');
});
```

- [ ] **Step 3: Run** `cd apps/lambdas/api && pnpm exec vitest run src/shared/permissions` — expected FAIL (module not found).

- [ ] **Step 4: Implement `checkAccess` and `forbiddenFor`** in `check-access.ts`, using `hasRole` from `@gitgazer/db/types` and the logger as `require-role.ts` does today. A `minRole` operation called without `integrationId` is a programming error: throw `BadRequestError('Missing integration identifier')` after `logger.error`, as `requireRole` does.

- [ ] **Step 5: Run** the same command — expected PASS. Then `pnpm run typecheck`.

- [ ] **Step 6: Commit** — `feat: add the permission table and checkAccess`

---

### Task 2: `authorize` middleware

**Files:**

- Create: `apps/lambdas/api/src/shared/middleware/authorization.ts`
- Modify: `apps/lambdas/api/src/app.ts` (mount after `app.use(authenticate)`)
- Modify: `apps/lambdas/api/src/domains/integrations/integrations.middleware.ts` (skip loading when `appContext.integrationRoles` is already set)
- Test: `apps/lambdas/api/src/shared/middleware/authorization.test.ts`

**Interfaces:**

- Consumes: `ROUTES`, `OPERATIONS`, `checkAccess`, `forbiddenFor` (Task 1); `getUserIntegrationRoles(userId)` from `@/domains/integrations/integrations.controller`.
- Produces: `authorize: MiddlewareHandler<AppEnv>`.

Behaviour, in order:

1. Find the matched route: the last entry of `matchedRoutes(c)` whose `method` is not `'ALL'`. None → `await next()` (the not-found handler answers 404).
2. Look up `ROUTES[`${route.method} ${route.path}`]`. Missing → `logger.info('authz', {…, allowed: false, reason: 'no permission entry'})` and throw `ForbiddenError('Insufficient permissions')`.
3. `'public'`, `'authenticated'`, or `checkedInHandler` → `next()`.
4. `minRole`: if `appContext.integrationRoles` is unset, load it with `getUserIntegrationRoles` and set `integrationRoles` and `integrations`. Read `integrationId` from the request path at the index of `:integrationId` in the route pattern (a router-level middleware sees no route params — verified with Hono 4.13). Call `checkAccess`; refusal → `throw forbiddenFor(decision)`; allowed → set `appContext.role` and `next()`.

- [ ] **Step 1: Write the failing tests** in `authorization.test.ts`. Build the app with `createApp()` mocks as in `src/app.test.ts`, or a small Hono app with `createBaseApp()`, a context-setting middleware and `authorize`, and stub handlers registered at the real patterns. Mock `getUserIntegrationRoles`.

```ts
// Table-driven over every ROUTES entry with a minRole (not checkedInHandler):
it.each(minRoleRoutes)('%s refuses roles below %s and allows it', async (key, minRole) => { … 403 'Insufficient permissions' below, 200 at minRole });
it('refuses a member of other integrations with Not a member', …);           // 403 'Not a member of this integration'
it('reads integrationId from a nested pattern', …);                            // DELETE /api/integrations/i1/apps/a1 checks role in i1
it('treats a trailing slash like the route without it', …);                    // GET /api/integrations/i1/members/
it('uses the GET entry for HEAD', …);                                          // HEAD /api/integrations/i1/members → 200 for viewer
it('lets an OPTIONS preflight through to CORS', …);                            // with createApp: OPTIONS + Origin → not 401/403
it('answers 404 for an unknown path', …);                                      // GET /api/nope, authenticated → 404
it('refuses a matched route without a table entry', …);                        // stub route GET /api/unlisted → 403, logs reason 'no permission entry'
it('loads roles only for minRole operations', …);                              // GET /api/workflows does not call getUserIntegrationRoles
it('sets appContext.role for the handler', …);
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/shared/middleware/authorization.test.ts` — expected FAIL.
- [ ] **Step 3: Implement `authorize`**, mount it in `app.ts` right after `app.use(authenticate)`, and make `addUserIntegrationsToCtx` keep roles that are already set.
- [ ] **Step 4: Run** `pnpm exec vitest run` and `pnpm run typecheck` — expected PASS (route tests don't use `createApp`, so `requireRole` still guards them).
- [ ] **Step 5: Commit** — `feat: check every api request against the permission table`

---

### Task 3: Remove `requireRole`

**Files:**

- Modify: every `domains/*/*.routes.ts` listed by `grep -rln requireRole apps/lambdas/api/src/domains` — drop the `requireRole(...)` argument and its import; keep `addUserIntegrationsToCtx`.
- Delete: `apps/lambdas/api/src/shared/middleware/require-role.ts`, `require-role.test.ts`
- Modify: `apps/lambdas/api/src/shared/hono/test-request.ts` (run `authorize` after the context-setting middleware)
- Modify: route tests in `domains/{integrations,members,slack,apps,notifications,metrics,auth}/*.routes.test.ts` and `src/app.test.ts`
- Modify: `packages/backend-core/src/types.ts` — the `role` comment says it is set by the `authorize` middleware.

**Interfaces:**

- Consumes: `authorize` via `testRequest` (Task 2).

- [ ] **Step 1: Add `authorize` to `testRequest`** after the context middleware, then **update route tests** so they pass the caller's roles in `testRequest`'s `appContext` (`integrationRoles`, `integrations`) instead of setting them only inside a mocked `addUserIntegrationsToCtx` (which now runs after `authorize`). Their existing 403 assertions (e.g. `DELETE /api/integrations/:integrationId` for admin, member, viewer) must keep passing unchanged. `src/app.test.ts` mocks `users.routes` with `GET /big`; change the mock to a route that is in the table (e.g. `GET /user`).
- [ ] **Step 2: Run** `pnpm exec vitest run` — expected PASS while `requireRole` is still in place (both checks agree).
- [ ] **Step 3: Remove** `requireRole` from the routes and delete the middleware and its test.
- [ ] **Step 4: Run** `pnpm exec vitest run`, `pnpm run typecheck`, `pnpm run lint` — expected PASS; `grep -rn requireRole apps/lambdas/api/src` finds nothing.
- [ ] **Step 5: Commit** — `refactor: drop requireRole in favour of the authorize middleware`

---

### Task 4: Slack callbacks use `checkAccess`

**Files:**

- Modify: `apps/lambdas/api/src/domains/apps/slack-install.ts` (`completeSlackInstall`)
- Modify: `apps/lambdas/api/src/domains/slack/connect.ts` (`completeSlackSignIn`)
- Test: `apps/lambdas/api/src/domains/apps/slack-install.test.ts`, `apps/lambdas/api/src/domains/slack/connect.test.ts`

**Interfaces:**

- Consumes: `checkAccess(caller, 'slackApp.installCallback' | 'slackUser.signInCallback', integrationId)` (Task 1).

- [ ] **Step 1: Write the failing tests**: a non-admin install callback and a non-member sign-in callback still redirect with the `failed` result (unchanged), and now log `authz` with `action: 'slackApp.installCallback'` / `'slackUser.signInCallback'` instead of `logger.warn`.
- [ ] **Step 2: Run** the tests — expected FAIL on the log assertion.
- [ ] **Step 3: Replace** the `hasRole(role, 'admin')` and `!integrationRoles[integrationId]` checks with `checkAccess({userId, integrationRoles}, …, integrationId).allowed`; drop the two `logger.warn` lines.
- [ ] **Step 4: Run** the tests — expected PASS.
- [ ] **Step 5: Commit** — `refactor: check slack callback access with checkAccess`

---

### Task 5: MCP tool wrapper checks every call

**Files:**

- Modify: `apps/lambdas/api/src/domains/mcp/mcp.tools.ts` (`registerTool`)
- Test: `apps/lambdas/api/src/domains/mcp/mcp.tools.test.ts` (existing)

**Interfaces:**

- Consumes: `TOOLS`, `ToolName`, `checkAccess`, `forbiddenFor` (Task 1).
- Produces: `registerTool(server, name: ToolName, config, run)` — the `name` parameter is typed `ToolName`, so a tool without a table entry does not compile.

- [ ] **Step 1: Write the failing tests**: (a) each tool call runs `checkAccess` with `TOOLS[name]` — spy on it and call a tool twice, expect two checks; (b) when `checkAccess` refuses (mock it), the tool returns `{isError: true}` with the `forbiddenFor` message and `run` is not called.
- [ ] **Step 2: Run** `pnpm exec vitest run src/domains/mcp/mcp.tools.test.ts` — expected FAIL.
- [ ] **Step 3: Implement**: type `name` as `ToolName`; after resolving the caller, call `checkAccess(caller, TOOLS[name], args.integration_id)` (read `integration_id` only if the args have it; today's tools don't); on refusal return `textResult(forbiddenFor(decision).message, true)`.
- [ ] **Step 4: Run** the tests and `pnpm run typecheck` — expected PASS.
- [ ] **Step 5: Commit** — `feat: check every mcp tool call against the permission table`

---

### Task 6: Completeness test

**Files:**

- Test: `apps/lambdas/api/src/shared/permissions/table.test.ts`

**Interfaces:**

- Consumes: `createApp` (with the mocks from `src/app.test.ts`, without mocking any routers), `registerMcpTools` with a fake server that records `registerTool` names, `publicRoutePrefixes`, `ROUTES`, `TOOLS`, `OPERATIONS`.

- [ ] **Step 1: Write the tests**:

```ts
it('has a table entry for every route', …);              // every non-ALL `${method} ${path}` in createApp().routes is in ROUTES
it('has a route for every table entry', …);              // every ROUTES key is registered
it('has a table entry for every tool and vice versa', …); // recorded tool names === Object.keys(TOOLS)
it('marks exactly the routes under publicPrefixes as public', …); // using authenticate's prefix rule (trailing / = subtree, else exact or segment)
it('puts :integrationId in every minRole route not checked in its handler', …);
it('uses every operation', …);                           // each OPERATIONS key is referenced by ROUTES or TOOLS
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/shared/permissions/table.test.ts` — expected PASS. Temporarily remove one `ROUTES` entry and confirm the first test fails, then restore it.
- [ ] **Step 3: Commit** — `test: check the permission table against every route and tool`

---

### Task 7: Docs

**Files:**

- Modify: `apps/docs/docs/technical/roles-and-permissions.md` — the Permission matrix intro names `apps/lambdas/api/src/shared/permissions/table.ts` as the source and describes the `authorize` middleware and the tool wrapper instead of `requireRole`; the matrix rows stay.
- Modify: `apps/docs/docs/technical/authentication.md` — the middleware chain becomes `compress → cors → authenticate → authorize → originCheck → route handler`; the `requireRole` section becomes an `authorize` section.
- Modify: `.github/instructions/backend.instructions.md`, `.github/skills/new-domain/SKILL.md`, `.github/skills/new-domain/assets/domain.routes.template.ts`, `.github/skills/new-domain/assets/domain.routes.test.template.ts` — a new route needs a table entry; no `requireRole`.

- [ ] **Step 1: Edit** the files; `grep -rn requireRole apps/docs .github` finds nothing.
- [ ] **Step 2: Run** `cd apps/docs && pnpm run build` and `pnpm exec prettier --check` on the changed files — expected PASS.
- [ ] **Step 3: Commit** — `docs: describe the permission table and authorize middleware`
