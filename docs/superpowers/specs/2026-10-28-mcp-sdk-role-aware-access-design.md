# MCP server on the official SDK, with role-aware database access — design

## Why

The GitGazer MCP server ([apps/lambdas/api/src/domains/mcp/](../../../apps/lambdas/api/src/domains/mcp/)) implements
the MCP protocol by hand: JSON-RPC handling, version negotiation for 2026-07-28 and legacy clients, header checks and
error codes live in [mcp.protocol.ts](../../../apps/lambdas/api/src/domains/mcp/mcp.protocol.ts) and
[mcp.headers.ts](../../../apps/lambdas/api/src/domains/mcp/mcp.headers.ts). Every spec change is code we write.

Its data access is `run_sql` over tables that the `gitgazer_mcp` Postgres role may read, isolated per tenant by RLS on
`rls.integration_ids`. That is enough for today's 10 `github` tables, which the web app shows to every member of an
integration. The plan is to open up **any useful table** later (notification rules, apps, handles, invitations, event
log, …). Several of those are restricted by role in the web app: invitations need member or above, and the GitHub
webhook secret, webhook handle URLs and invite tokens are shown to admins only. Integration membership alone can't
express that.

This project does two things:

1. Move the MCP server to the official TypeScript SDK.
2. Build the mechanism that lets the database enforce the caller's **role per integration** for MCP queries, so that
   future tables can be opened with the same rules as the web app.

## Goals

- The MCP endpoint is served by `@modelcontextprotocol/server`, mounted on the existing Hono route. The hand-written
  protocol layer is removed.
- `run_sql`, `list_tables` and `describe_table` behave as today: same results, same read-only guard, same quota, same
  rule of not leaking raw Postgres errors.
- Every MCP query transaction knows the caller's role in each of their integrations, and SQL policies and views can
  check "caller has at least role X in this row's integration".
- The pattern for opening a table later is written down and covered by tests, so the person who opens the next table
  only decides its role gate.

## Non-goals

- **Opening any new table or view** (owner). The set of readable tables stays exactly as it is.
- Changing Cognito: no new resource server or scope, no stricter token binding. Today's verifier keeps accepting the
  web app client's and the MCP client's access tokens.
- Changing the OAuth proxy in front of Cognito ([mcp-oauth.controller.ts](../../../apps/lambdas/api/src/domains/mcp/mcp-oauth.controller.ts))
  or the well-known metadata endpoints, beyond what the SDK switch requires.

## Anti-goals

- **No caller may widen their own access.** The role information must be set by the app, outside the caller's SQL,
  and must not be changeable from a `run_sql` query.
- **No regression in tenant isolation.** The existing layers (single-statement guard, subquery wrap, read-only
  transaction, `SET LOCAL ROLE gitgazer_mcp`, tenant RLS, statement timeout) all stay.

## Decisions

### SDK switch (owner: use the SDK; details my call)

- Dependency: `@modelcontextprotocol/server` only (brings zod 4). Neither `@modelcontextprotocol/node` (raw
  `node:http`/Express) nor `@modelcontextprotocol/hono` is used: the Hono adapter's `createMcpHonoApp` builds a
  separate app with localhost Host validation, which would reject requests through CloudFront, and the handler mounts
  on the existing router directly.
- **Both eras, as today.** In SDK 2.4.0 only `createMcpHandler(factory)` serves 2026-07-28 clients
  (`server/discover`, per-request protocol version); a self-built `WebStandardStreamableHTTPServerTransport` accepts
  legacy versions only and would refuse modern clients. So the route uses the SDK's documented split:
    - `isLegacyRequest(request)` true → a stateless `WebStandardStreamableHTTPServerTransport` per request with
      `sessionIdGenerator: undefined` and **`enableJsonResponse: true`**.
    - otherwise → `createMcpHandler(factory, {legacy: 'reject'})`, with JSON responses if its `responseMode` allows.
      Every response stays `application/json`, as today. Nothing in `infra/` configures response streaming for the
      Web Function, so SSE through it and CloudFront is untested and not relied on.
- Both paths build their `McpServer` from the same factory (tools + instructions), one per request, and receive the
  verified `authInfo`. The builder confirms in dev that a legacy client (Claude Code) and a 2026-07-28 request both
  work.
- Tools are registered with `registerTool` and zod input schemas, with `readOnlyHint: true`.
- **`list_integrations` is removed** (owner); `github.integrations` is queryable through `run_sql`.
- The `server/discover` instructions in today's `INSTRUCTIONS` constant move to the SDK's server instructions,
  unchanged apart from dropping any mention of `list_integrations`.
- Tool errors keep today's rule: messages from `McpToolError`, `ReadOnlyQueryError` and permission-denied errors are
  returned to the client; anything else is logged and returned as "Tool execution failed". The SDK's own tool-error
  handling would echo raw messages (including Postgres ones), so each tool handler catches and maps errors itself.
- [mcp.protocol.ts](../../../apps/lambdas/api/src/domains/mcp/mcp.protocol.ts),
  [mcp.headers.ts](../../../apps/lambdas/api/src/domains/mcp/mcp.headers.ts) and their tests are deleted. Tests that
  cover our behavior (tools, auth, quota, error mapping) are rewritten against the SDK-based handler.

### Bearer auth through the SDK (my call)

- `requireBearerAuth({verifier, resourceMetadataUrl})` from the SDK gates the endpoint. The verifier wraps today's
  `getMcpAccessVerifier()` and returns an `AuthInfo` with `expiresAt` from the token's `exp` (the SDK refuses tokens
  without it), `clientId` from `client_id`, and the Cognito `sub` in `extra`.
- `resourceMetadataUrl` is today's `protectedResourceMetadataUrl(...)`, so the `WWW-Authenticate` challenge keeps
  pointing at our protected-resource metadata. No `requiredScopes`, no `expectedResource` (Cognito access tokens
  carry no audience; see non-goals).
- The verifier also resolves the GitGazer user from the token's `sub` (as `resolveMcpCaller` does today) and puts
  the user id into `AuthInfo.extra`. An unknown user is an invalid token, so it keeps today's 401 instead of
  becoming a tool error.
- The tool handlers read the user id from `ctx.http.authInfo` and load the caller's roles with
  `getUserIntegrationRoles(userId)` per call, so a role change applies to the next query.
- The well-known endpoints and the OAuth proxy routes stay as they are.

### Role-aware access in the database (owner: respect roles per integration; mechanism my call)

**Passing the roles.** `runReadOnlyQuery` takes the caller's role map (`integrationId → role`) instead of a plain
list of ids. Inside the transaction it sets, next to the existing `rls.integration_ids` (derived from the same map):

```sql
SET LOCAL rls.integration_roles = '<uuid>:<role>,<uuid>:<role>,...';
```

Each id is validated as a UUID and each role against `MEMBER_ROLES` before interpolation, as
`withRlsTransaction` already does for ids. Only the MCP path sets it; the reader and writer roles are untouched.

**Why the caller can't change it.** `assertReadOnlySelect` blocks `set_config`, and `SET`/`RESET` need a second
statement, which the `;` check rejects. The setting is `LOCAL`, so it ends with the transaction. The revoke of
`set_config` from `gitgazer_mcp` (migration `20260721204116_tough_black_bolt`) only warns when it lacks permission
and may have been a no-op on Aurora; the builder checks its effect in dev and notes the result, but the design does
not depend on it.

**Role.** MCP queries keep running as `gitgazer_mcp` (owner): its explicit grants, its own policies and its
`set_config` lockdown are what make arbitrary caller SQL safe. Per-app-role database roles are not an option, since
one query can span integrations where the caller holds different roles.

**The helper.** A migration adds a SQL function, e.g.

```sql
github.mcp_has_role(integration_id uuid, minimum_role text) RETURNS boolean
```

It reads `rls.integration_roles`, finds the caller's role for that integration and compares ranks in the same order as
`hasRole` in [members.ts](../../../packages/db/src/types/members.ts) (owner > admin > member > viewer). No entry,
missing setting or unknown role means `false`. It is `STABLE`, `SECURITY INVOKER`, and executable by `gitgazer_mcp`.

**The pattern for opening a table later** (documented, not applied to any table in this project):

- _Row gate:_ the table gets an MCP policy `FOR SELECT TO gitgazer_mcp USING (<tenant check> AND
github.mcp_has_role(integration_id, '<min role>'))`, plus `GRANT SELECT`. A table every member may see uses the
  existing `mcpTenantSeparationPolicy()` with `'viewer'` semantics, i.e. the tenant check alone.
- _Column gate:_ a table with admin-only columns is **not** granted directly. It is exposed through a
  `security_barrier` view that returns the column only when `github.mcp_has_role(integration_id, 'admin')` and
  `NULL` otherwise. The view is owned so that the base table's RLS still applies to the MCP caller (the builder picks
  between `security_invoker = true` with the base table granted column-wise, or an owner-run view with its own
  tenant filter, and documents why).
- _Global tables without RLS_ (e.g. `gitgazer.users`, `gitgazer.slack_workspaces`) are only ever exposed through a
  view that scopes them to the caller's integrations.

The Drizzle schema gets a policy factory next to `mcpTenantSeparationPolicy()` in
[misc.ts](../../../packages/db/src/schema/github/misc.ts), e.g. `mcpRolePolicy(minimumRole)`, so opening a table is
one line in its definition plus a grant in the migration.

**Documentation.** The MCP server page
([mcp-server.md](../../../apps/docs/docs/technical/mcp-server.md)) gets: the SDK-based transport, the removed
`list_integrations`, and a "Security model" section on role-aware access with the pattern above.

### Tests (my call)

- `runReadOnlyQuery` / `withRlsTransaction`: the role map is validated (bad UUID or unknown role throws before any SQL
  runs) and both settings are set in the transaction (unit test with the mocked client, like the existing
  `rls-transaction.test.ts`).
- `mcp_has_role`: its behavior (rank order, missing entry, missing setting, unknown role) must be checked against a
  real Postgres. The repo has no database-backed tests today. The builder either adds one (for example with PGlite,
  if it supports the role and `current_setting` behavior needed) or, if that isn't viable, verifies the function
  manually against the dev database and records the queries and results in the PR. This choice is the builder's.
- MCP endpoint: 401 with the `WWW-Authenticate` challenge for a missing/invalid/expired token; `tools/list` returns
  exactly the three tools; `run_sql` passes the caller's role map down; error mapping as today.

## Left to the builder

- File layout inside `domains/mcp/` after the switch, and what remains of `mcp.controller.ts`.
- The exact encoding of `rls.integration_roles` (the comma list above or JSON), as long as it is validated before
  interpolation and parsed only by `mcp_has_role`.
- Which schema the helper function lives in.
- How the per-request `McpServer` is constructed (factory function, shared tool registration).
