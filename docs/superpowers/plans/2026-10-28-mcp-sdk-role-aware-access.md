# MCP SDK Switch and Role-Aware Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the GitGazer MCP endpoint through the official MCP TypeScript SDK and pass each caller's role per
integration into the database, with a SQL helper that future policies use to enforce those roles.

**Architecture:** The hand-written JSON-RPC layer is replaced by `@modelcontextprotocol/server`: `requireBearerAuth`
gates `POST /api/mcp`, legacy requests go to a stateless JSON transport and 2026-07-28 requests to
`createMcpHandler(..., {legacy: 'reject'})`, both built from one server factory. `runReadOnlyQuery` takes the caller's
role map and sets `rls.integration_roles` next to `rls.integration_ids`; a migration adds `github.mcp_has_role` and a
Drizzle policy factory for later tables. No table is opened.

**Tech Stack:** TypeScript, Hono, `@modelcontextprotocol/server` 2.4.0, zod 4, Drizzle ORM, Aurora PostgreSQL,
Vitest, pnpm/nx.

**Spec:** [docs/superpowers/specs/2026-10-28-mcp-sdk-role-aware-access-design.md](../specs/2026-10-28-mcp-sdk-role-aware-access-design.md)

## Global Constraints

- Only `@modelcontextprotocol/server` is added (pinned `2.4.0` in the pnpm catalog) plus `zod` for tool schemas; not
  `@modelcontextprotocol/hono`, not `@modelcontextprotocol/node`.
- Every MCP response stays `application/json`; no SSE.
- The readable set of tables does not change. No new grant on any table or view.
- MCP queries keep running as `gitgazer_mcp`; all existing isolation layers stay (single-statement guard, subquery
  wrap, read-only transaction, `SET LOCAL ROLE`, tenant RLS, statement timeout).
- No Cognito changes: the verifier keeps accepting web-app and MCP client access tokens; no `requiredScopes`, no
  `expectedResource`.
- OAuth proxy routes and the `.well-known` documents stay byte-for-byte as today (`mcp.metadata.test.ts` must keep
  passing unchanged).
- `list_integrations` is removed; the tools are exactly `run_sql`, `list_tables`, `describe_table`.
- Role order is `owner > admin > member > viewer`, as `ROLE_RANK` in `packages/db/src/types/members.ts`.
- Path aliases `@/` and `@gitgazer/*`; no cross-project relative imports. Comment only non-obvious _why_.
- Changed files pass Prettier and ESLint: `pnpm exec nx run-many -t lint pretty:check -p <projects>` for code, and
  `pnpm exec prettier --check <file>` for changed Markdown.
- Commits: `type: description`, one line, no body, no trailers, no mention of Claude/AI.

## Review Focus

1. A legacy client (Claude Code) calling `tools/call` in a request with no prior `initialize` on that server
   instance: it must get the tool result, since every request gets a fresh stateless server. Pinned in Task 4.
2. A valid Cognito token for a user who never signed in to the web app: 401 with the `WWW-Authenticate` challenge
   pointing at the protected-resource metadata, not a tool error. Pinned in Task 3.
3. A caller with no integrations: `run_sql` runs with both settings empty and returns zero rows, no error. Pinned in
   Task 1.
4. A raw Postgres/driver error from `run_sql`: the client sees "Tool execution failed", never the raw message, while
   `ReadOnlyQueryError`/`McpToolError` messages are still echoed. Pinned in Task 4.
5. A role map value outside `MEMBER_ROLES` (e.g. bad data in `user-assignments`): rejected before any SQL runs, so
   nothing unvalidated is interpolated into `SET LOCAL`. Pinned in Task 1.

---

### Task 1: Pass the caller's role map into MCP query transactions

**Files:**

- Modify: `packages/db/src/client.ts:129-166` (`withRlsTransaction`)
- Modify: `packages/db/src/queries/readonlyQuery.ts` (`runReadOnlyQuery` params)
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.controller.ts` (`McpCaller`, `resolveMcpCaller`)
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.tools.ts` (pass `integrationRoles`)
- Test: `apps/lambdas/api/src/domains/mcp/rls-transaction.test.ts`, `apps/lambdas/api/src/domains/mcp/readonly-query.test.ts`,
  `apps/lambdas/api/src/domains/mcp/mcp.tools.test.ts`, `apps/lambdas/api/src/domains/mcp/mcp.controller.test.ts`

**Interfaces:**

- Produces: `withRlsTransaction` gains optional `integrationRoles?: Record<string, MemberRole>`; when given, it runs
  `SET LOCAL rls.integration_roles = '<uuid>:<role>,…'` right after `rls.integration_ids`, after validating every key
  with the existing UUID check and every value with `isMemberRole`, throwing `Error('Invalid integration role: …')`
  before the transaction starts.
- Produces: `runReadOnlyQuery(params: {sql: string; integrationRoles: Record<string, MemberRole>; rowCap?: number;
statementTimeoutS?: number})` — `integrationIds` is gone; it passes `integrationIds: Object.keys(integrationRoles)`
  and `integrationRoles` to `withRlsTransaction`.
- Produces: `type McpCaller = {userId: number; integrationRoles: Record<string, MemberRole>}`.

- [ ] **Step 1: Write the failing tests**

In `rls-transaction.test.ts`:

```ts
it('sets rls.integration_roles from the role map', async () => {
    await withRlsTransaction({integrationIds: [ID_A, ID_B], integrationRoles: {[ID_A]: 'admin', [ID_B]: 'viewer'}, callback: async () => undefined});
    expect(executedSql()).toContain(`SET LOCAL rls.integration_roles = '${ID_A}:admin,${ID_B}:viewer';`);
});
it('sets both settings to empty strings for a caller without integrations', async () => {
    await withRlsTransaction({integrationIds: [], integrationRoles: {}, callback: async () => undefined});
    expect(executedSql()).toContain(`SET LOCAL rls.integration_ids = '';`);
    expect(executedSql()).toContain(`SET LOCAL rls.integration_roles = '';`);
});
it('rejects an unknown role before starting the transaction', async () => {
    await expect(
        withRlsTransaction({integrationIds: [ID_A], integrationRoles: {[ID_A]: 'superuser' as MemberRole}, callback: vi.fn()}),
    ).rejects.toThrow('Invalid integration role');
    expect(db.transaction).not.toHaveBeenCalled();
});
it('rejects a role map key that is not a UUID', async () => {
    await expect(withRlsTransaction({integrationIds: [], integrationRoles: {"x'; RESET ROLE; --": 'admin'}, callback: vi.fn()})).rejects.toThrow();
});
it('does not set rls.integration_roles when no role map is given', async () => {
    await withRlsTransaction({integrationIds: [ID_A], callback: async () => undefined});
    expect(executedSql()).not.toContain('rls.integration_roles');
});
```

(`executedSql()` / `ID_A` / `ID_B` follow the file's existing mocking of `db.transaction`; add them if missing.)

In `readonly-query.test.ts`, change the existing "runs under the mcp role…" test to call
`runReadOnlyQuery({sql: 'SELECT 1', integrationRoles: {[ID_A]: 'member'}})` and assert both
`rls.integration_ids = '<ID_A>'` and `rls.integration_roles = '<ID_A>:member'` are set. Update every other call in the
file from `integrationIds` to `integrationRoles`.

In `mcp.tools.test.ts`, the `CALLER` fixture becomes `{userId: 1, integrationRoles: {[ID_A]: 'viewer'}}` and the
`run_sql` test asserts `runReadOnlyQuery` was called with `integrationRoles: CALLER.integrationRoles`.

In `mcp.controller.test.ts`, "resolves the user id + integrations" asserts
`{userId: 7, integrationRoles: {[ID_A]: 'admin'}}`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/lambdas/api && pnpm exec vitest run src/domains/mcp/rls-transaction.test.ts src/domains/mcp/readonly-query.test.ts src/domains/mcp/mcp.tools.test.ts src/domains/mcp/mcp.controller.test.ts`
Expected: FAIL (`rls.integration_roles` never set; type errors on `integrationRoles`).

- [ ] **Step 3: Implement the role map in `withRlsTransaction`, `runReadOnlyQuery`, `McpCaller` and the tool calls**

`resolveMcpCaller` returns the map `getUserIntegrationRoles` already gives it. `mcp.tools.ts` passes
`integrationRoles` instead of `integrationIds` in every `runReadOnlyQuery` call. Import `MemberRole`/`isMemberRole`
inside `packages/db` from its own types module.

- [ ] **Step 4: Run the tests to verify they pass**

Run the command from Step 2, then `pnpm exec nx run-many -t test:unit -p @gitgazer/db @gitgazer/lambda-api`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/client.ts packages/db/src/queries/readonlyQuery.ts apps/lambdas/api/src/domains/mcp
git commit -m "feat: pass the caller's role per integration into mcp query transactions"
```

---

### Task 2: Add the `mcp_has_role` helper and the role policy factory

**Files:**

- Create: `packages/db/drizzle/<timestamp>_mcp_has_role/migration.sql` via `cd packages/db && npx drizzle-kit generate --custom --name=mcp_has_role`
- Modify: `packages/db/src/schema/github/misc.ts` (add `mcpRolePolicy`)
- Create: `packages/db/src/schema/github/misc.test.ts`
- Optionally create: `packages/db/src/queries/mcp-has-role.test.ts` (see Step 5)
- Modify: `apps/docs/docs/technical/mcp-server.md` ("Security model": role-aware access and the pattern for opening tables)

**Interfaces:**

- Consumes: the `rls.integration_roles` encoding from Task 1 (`<uuid>:<role>` joined by `,`).
- Produces: SQL `github.mcp_has_role(p_integration_id uuid, p_minimum_role text) RETURNS boolean`, executable by
  `gitgazer_mcp`.
- Produces: `mcpRolePolicy(minimumRole: MemberRole): PgPolicy` — `pgPolicy('tenant separation mcp ' + minimumRole, {as: 'permissive', to: gitgazerMcp, for: 'select', using: sql\`(<existing tenant check>) AND github.mcp_has_role(integration_id, '${minimumRole}')\`})`, reusing the `using`expression already in`misc.ts`. Not applied to any table.

- [ ] **Step 1: Write the failing test for the policy factory**

```ts
describe('mcpRolePolicy', () => {
    it('is a select-only policy for gitgazer_mcp that combines the tenant check with the role check', () => {
        const policy = mcpRolePolicy('admin');
        expect(policy.to).toBe(gitgazerMcp);
        expect(policy.for).toBe('select');
        const using = renderSql(policy.using);
        expect(using).toContain("current_setting('rls.integration_ids', TRUE)");
        expect(using).toContain("github.mcp_has_role(integration_id, 'admin')");
    });
});
```

(`renderSql` is whatever turns a drizzle `SQL` into a string in a unit test, e.g. `new PgDialect().sqlToQuery(sql).sql`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/db && pnpm exec vitest run src/schema/github/misc.test.ts`
Expected: FAIL with "mcpRolePolicy is not a function" / import error.

- [ ] **Step 3: Implement `mcpRolePolicy` in `misc.ts` and write the migration**

The migration body (the algorithm is fixed here so policy semantics match `hasRole`; params are referenced as `$1`/`$2`
so they never shadow a column named `integration_id` at the call site):

```sql
CREATE OR REPLACE FUNCTION github.mcp_has_role(p_integration_id uuid, p_minimum_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
    WITH ranks(role, rank) AS (VALUES ('owner', 0), ('admin', 1), ('member', 2), ('viewer', 3)),
    entries AS (
        SELECT split_part(entry, ':', 1) AS integration_id, split_part(entry, ':', 2) AS role
        FROM unnest(string_to_array(NULLIF(current_setting('rls.integration_roles', TRUE), ''), ',')) AS entry
    )
    SELECT COALESCE((
        SELECT caller.rank <= required.rank
        FROM entries
        JOIN ranks AS caller ON caller.role = entries.role
        JOIN ranks AS required ON required.role = $2
        WHERE entries.integration_id = $1::text
    ), FALSE)
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION github.mcp_has_role(uuid, text) TO gitgazer_mcp;
```

- [ ] **Step 4: Run the factory test to verify it passes**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Verify the function against a real Postgres**

Try PGlite first: add `@electric-sql/pglite` as a dev dependency of `packages/db` and write
`src/queries/mcp-has-role.test.ts`, which creates schema `github`, runs the migration file's `CREATE FUNCTION`, and in
a transaction with `SET LOCAL rls.integration_roles = '<A>:admin,<B>:viewer'` asserts:

| call                               | expected |
| ---------------------------------- | -------- |
| `mcp_has_role('<A>', 'member')`    | `true`   |
| `mcp_has_role('<A>', 'owner')`     | `false`  |
| `mcp_has_role('<B>', 'viewer')`    | `true`   |
| `mcp_has_role('<B>', 'member')`    | `false`  |
| `mcp_has_role('<C>', 'viewer')`    | `false`  |
| `mcp_has_role('<A>', 'superuser')` | `false`  |
| any call with the setting unset    | `false`  |

If PGlite cannot run this (e.g. custom GUCs or `STABLE SQL` functions unsupported), remove the dependency and the test,
and instead record the same seven queries and their results from the dev database in the PR description once the
migration is applied (Task 5).

- [ ] **Step 6: Document the pattern**

In `mcp-server.md` → "Security model", add: the caller's roles reach the database as `rls.integration_roles`; the
helper `github.mcp_has_role`; row gates via `mcpRolePolicy(minimumRole)`; column gates via a `security_barrier` view
that returns admin-only columns only when `github.mcp_has_role(integration_id, 'admin')` and `NULL` otherwise; global
tables only through a view scoped to the caller's integrations; and that no table uses this yet.

- [ ] **Step 7: Run checks and commit**

Run: `pnpm exec nx run-many -t test:unit lint pretty:check -p @gitgazer/db` and
`pnpm exec prettier --check apps/docs/docs/technical/mcp-server.md`. Expected: PASS.

```bash
git add packages/db apps/docs/docs/technical/mcp-server.md
git commit -m "feat: add the mcp_has_role helper and role policy factory for mcp access"
```

---

### Task 3: Verify MCP bearer tokens through an SDK token verifier

**Files:**

- Modify: `apps/lambdas/api/src/domains/mcp/mcp.controller.ts` (replace `resolveMcpCaller`/`McpAuthError` with the verifier)
- Modify: `pnpm-workspace.yaml` (catalog: `'@modelcontextprotocol/server': '2.4.0'`, `'zod': '^4.2.0'`), `apps/lambdas/api/package.json` (both as devDependencies, like the other bundled deps)
- Test: `apps/lambdas/api/src/domains/mcp/mcp.controller.test.ts`

**Interfaces:**

- Consumes: `getMcpAccessVerifier()` from `@/shared/middleware/token-verifier`; `users` from `@gitgazer/db/schema/gitgazer`.
- Produces: `mcpTokenVerifier: OAuthTokenVerifier` whose `verifyAccessToken(token)` returns
  `AuthInfo {token, clientId: payload.client_id, scopes: payload.scope?.split(' ') ?? [], expiresAt: payload.exp, extra: {userId}}`,
  and throws `new OAuthError(OAuthErrorCode.InvalidToken, …)` for an invalid/expired token and for a `sub` with no `users` row.
- Produces: `mcpUserId(authInfo: AuthInfo | undefined): number` — reads `extra.userId`, throws if absent.
- `McpCaller` (Task 1) stays exported from this file.

- [ ] **Step 1: Write the failing tests** (replace the `resolveMcpCaller` block)

```ts
describe('mcpTokenVerifier', () => {
    it('returns AuthInfo with expiry, client id and the GitGazer user id', async () => {
        verify.mockResolvedValue({sub: 'cognito-sub', client_id: 'mcp-client', exp: 1_900_000_000, scope: 'openid email'});
        usersLookup.mockResolvedValue([{id: 7}]);
        await expect(mcpTokenVerifier.verifyAccessToken('tok')).resolves.toEqual({
            token: 'tok',
            clientId: 'mcp-client',
            scopes: ['openid', 'email'],
            expiresAt: 1_900_000_000,
            extra: {userId: 7},
        });
    });
    it('rejects an invalid or expired token as invalid_token', async () => {
        verify.mockRejectedValue(new Error('expired'));
        await expect(mcpTokenVerifier.verifyAccessToken('tok')).rejects.toMatchObject({code: OAuthErrorCode.InvalidToken});
    });
    it('rejects a token for a user that has never signed in as invalid_token', async () => {
        verify.mockResolvedValue({sub: 'cognito-sub', client_id: 'c', exp: 1_900_000_000});
        usersLookup.mockResolvedValue([]);
        await expect(mcpTokenVerifier.verifyAccessToken('tok')).rejects.toMatchObject({code: OAuthErrorCode.InvalidToken});
    });
});
describe('mcpUserId', () => {
    it('reads the user id from AuthInfo.extra', () => expect(mcpUserId({token: 't', clientId: 'c', scopes: [], extra: {userId: 7}})).toBe(7));
    it('throws when AuthInfo carries no user id', () => expect(() => mcpUserId(undefined)).toThrow());
});
```

Keep the `buildProtectedResourceMetadata` tests unchanged.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm install && cd apps/lambdas/api && pnpm exec vitest run src/domains/mcp/mcp.controller.test.ts`
Expected: FAIL (`mcpTokenVerifier` not exported).

- [ ] **Step 3: Implement `mcpTokenVerifier` and `mcpUserId` next to the existing `resolveMcpCaller`**

`resolveMcpCaller` and `McpAuthError` stay until Task 4 switches the route, so this commit typechecks; their tests are
replaced by the ones above. Task 4 deletes them.

- [ ] **Step 4: Run them to verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml apps/lambdas/api/package.json apps/lambdas/api/src/domains/mcp/mcp.controller.ts apps/lambdas/api/src/domains/mcp/mcp.controller.test.ts
git commit -m "feat: verify mcp bearer tokens through an sdk token verifier"
```

---

### Task 4: Serve the MCP endpoint through the SDK

**Files:**

- Create: `apps/lambdas/api/src/domains/mcp/mcp.server.ts`
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.tools.ts` (SDK registration; `list_integrations` removed)
- Modify: `apps/lambdas/api/src/domains/mcp/mcp.routes.ts` (`POST /` only; OAuth and well-known routes untouched)
- Delete: `mcp.protocol.ts`, `mcp.protocol.test.ts`, `mcp.headers.ts`, `mcp.headers.test.ts` (all in `apps/lambdas/api/src/domains/mcp/`)
- Test: `apps/lambdas/api/src/domains/mcp/mcp.routes.test.ts` (rewritten), `apps/lambdas/api/src/domains/mcp/mcp.tools.test.ts`
- Modify: `apps/docs/docs/technical/mcp-server.md` (transport, tools table, quota paragraph)

**Interfaces:**

- Consumes: `mcpTokenVerifier`, `mcpUserId`, `protectedResourceMetadataUrl`, `McpCaller` (Task 3/1);
  `getUserIntegrationRoles(userId): Promise<Record<string, MemberRole>>`; `runReadOnlyQuery` (Task 1).
- Produces: `createMcpServer(): McpServer` in `mcp.server.ts` — `new McpServer({name: 'gitgazer-mcp', version: '1.0.0'},
{instructions: INSTRUCTIONS})` with the three tools registered; `INSTRUCTIONS` moves here unchanged from
  `mcp.protocol.ts`.
- Produces: `registerMcpTools(server: McpServer): void` in `mcp.tools.ts`. Each tool: zod input schema
  (`run_sql: {sql: z.string().min(1)}`, `list_tables: {}`, `describe_table: {table: z.string().regex(/^[A-Za-z0-9_]+$/)}`),
  `annotations: {readOnlyHint: true}`, today's descriptions (drop the mention of `integrations` being a separate tool,
  if any). The handler builds `McpCaller` as `{userId, integrationRoles: await getUserIntegrationRoles(userId)}` with
  `userId = mcpUserId(ctx.http?.authInfo)`, runs today's logic, and maps errors itself: `McpToolError`,
  `ReadOnlyQueryError` and `DrizzleQueryError` with cause code `42501` → `{content: [{type: 'text', text: message}], isError: true}`;
  anything else → logged with `getLogger().error('MCP tool call failed', {tool, error})` and returned as
  `'Tool execution failed'`.

- [ ] **Step 1: Write the failing route tests** (replace `mcp.routes.test.ts`'s `POST /api/mcp` block; mock
      `@/domains/mcp/mcp.controller`'s `mcpTokenVerifier` and `getUserIntegrationRoles`, and `runReadOnlyQuery`)

```ts
it('answers 401 with the resource-metadata challenge when the token is rejected', async () => {
    verifyAccessToken.mockRejectedValue(new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or expired access token'));
    const res = await post(legacyBody('tools/list'));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata="https://app.example.com/.well-known/oauth-protected-resource"');
});
it('serves a legacy initialize as JSON', async () => {
    const res = await post(legacyBody('initialize', {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 't', version: '1'}}));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()).result.serverInfo.name).toBe('gitgazer-mcp');
});
it('lists exactly the three read-only tools', async () => {
    const {result} = await (await post(legacyBody('tools/list'))).json();
    expect(result.tools.map((t: {name: string}) => t.name)).toEqual(['run_sql', 'list_tables', 'describe_table']);
    expect(result.tools.every((t: {annotations?: {readOnlyHint?: boolean}}) => t.annotations?.readOnlyHint)).toBe(true);
});
it('runs a legacy tools/call without a prior initialize, with the caller role map', async () => {
    getUserIntegrationRoles.mockResolvedValue({[ID_A]: 'admin'});
    const res = await post(legacyBody('tools/call', {name: 'list_tables', arguments: {}}));
    expect(res.status).toBe(200);
    expect(runReadOnlyQuery).toHaveBeenCalledWith(expect.objectContaining({integrationRoles: {[ID_A]: 'admin'}}));
});
it('serves a 2026-07-28 server/discover as JSON with the instructions', async () => {
    const res = await post(modernBody('server/discover'), modernHeaders('server/discover'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()).result.instructions).toContain('run_sql');
});
it('serves a 2026-07-28 tools/call as JSON', async () => {
    const res = await post(modernBody('tools/call', {name: 'list_tables', arguments: {}}), modernHeaders('tools/call', 'list_tables'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
});
```

In `mcp.tools.test.ts`, drive the registered handlers (e.g. through `createMcpServer()` and the route, or by capturing
the callbacks passed to a fake `registerTool`) and keep every existing behavior test except `list_integrations`, plus:

```ts
it('returns a raw database error as a generic tool error', async () => {
    runReadOnlyQuery.mockRejectedValue(new Error('relation "secret_table" does not exist at character 15'));
    expect(await callTool('run_sql', {sql: 'SELECT 1'})).toEqual({content: [{type: 'text', text: 'Tool execution failed'}], isError: true});
});
it('echoes a ReadOnlyQueryError message', async () => {
    runReadOnlyQuery.mockRejectedValue(new ReadOnlyQueryError('Only read-only SELECT/WITH queries are allowed'));
    expect(await callTool('run_sql', {sql: 'DELETE FROM x'})).toMatchObject({
        isError: true,
        content: [{text: 'Only read-only SELECT/WITH queries are allowed'}],
    });
});
it('rejects an unknown tool', async () => {
    /* SDK answers with an error for 'list_integrations' */
});
```

`modernBody`/`modernHeaders` build the 2026-07-28 envelope the SDK requires (`_meta` protocol-version claim plus the
`MCP-Protocol-Version`, `Mcp-Method` and, for `tools/call`, `Mcp-Name` headers; add any other `_meta` field the SDK's
validation ladder demands).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/lambdas/api && pnpm exec vitest run src/domains/mcp`
Expected: FAIL (old hand-written route).

- [ ] **Step 3: Implement `createMcpServer`, `registerMcpTools` and the new `POST /` route; delete the protocol and header modules**

Route order: `requireBearerAuth({verifier: mcpTokenVerifier, resourceMetadataUrl: protectedResourceMetadataUrl(requestOrigin(c))})`
on `c.req.raw` → return the challenge `Response` as is → `await isLegacyRequest(c.req.raw)` → legacy: new
`createMcpServer()` connected to `new WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true})`,
`return transport.handleRequest(c.req.raw, {authInfo})`; modern: a module-level
`createMcpHandler(() => createMcpServer(), {legacy: 'reject', responseMode: 'json'})`, `return handler.fetch(c.req.raw, {authInfo})`.
Remove the `cacheScope`/`ttlMs` hints and other hand-written envelope details; the SDK owns the wire format. Delete
`resolveMcpCaller` and `McpAuthError` from `mcp.controller.ts`.

- [ ] **Step 4: Run the tests and the full api checks**

Run: `pnpm exec nx run-many -t test:unit lint pretty:check build -p @gitgazer/lambda-api` and
`pnpm exec prettier --check apps/docs/docs/technical/mcp-server.md`.
Expected: PASS; `apps/lambdas/api/dist/gitgazer-api.zip` builds.

- [ ] **Step 5: Update the docs**

In `mcp-server.md`: "Endpoint & transport" describes the SDK (both eras, JSON responses only); the tools table lists
the three tools; the quota paragraph names only `list_tables` and `describe_table` as free.

- [ ] **Step 6: Commit**

```bash
git add apps/lambdas/api/src/domains/mcp apps/docs/docs/technical/mcp-server.md
git commit -m "refactor: serve the mcp endpoint through the official sdk"
```

---

### Task 5: Verify in a deployed environment

Needs the owner's go-ahead: it applies a migration and deploys. Nothing is committed unless a check fails.

- [ ] **Step 1: Apply the migration and deploy** the branch the way the team does (`pnpm run migrate` in
      `packages/db` with DB access, and the CI deploy).
- [ ] **Step 2: Legacy client** — in Claude Code, connect to the deployed MCP server and run "list the tables" and a
      `run_sql` query. Expected: same tables as before this change, rows returned.
- [ ] **Step 3: Modern client** — send a 2026-07-28 `server/discover` and `tools/call` with `curl` and a valid bearer
      token. Expected: 200, `application/json`.
- [ ] **Step 4: Unauthenticated** — `curl -X POST <mcp url>` without a token. Expected: 401 with
      `WWW-Authenticate: Bearer … resource_metadata="…/.well-known/oauth-protected-resource"`.
- [ ] **Step 5: `mcp_has_role`** — if Task 2 Step 5 fell back, run the seven queries from its table as `gitgazer_mcp`
      in dev and record the results for the PR.
- [ ] **Step 6: `set_config` revoke** — as `gitgazer_mcp`, run
      `SELECT has_function_privilege('gitgazer_mcp', 'pg_catalog.set_config(text, text, boolean)', 'EXECUTE')` and record
      whether the 2026-07-21 revoke took effect.
