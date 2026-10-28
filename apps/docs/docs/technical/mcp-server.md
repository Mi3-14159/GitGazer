---
sidebar_position: 5
title: MCP Server
description: Remote Model Context Protocol server for read-only SQL access to GitGazer data, secured with OAuth 2.1 and PostgreSQL-enforced tenant isolation.
---

# MCP Server

GitGazer exposes a remote **[Model Context Protocol](https://modelcontextprotocol.io) (MCP)** server so AI assistants — VS Code Copilot, Claude Code, Claude Desktop, Cursor, and any other MCP client — can query a tenant's GitHub Actions data on the user's behalf.

It is **read-only**, authenticated with **OAuth 2.1**, and every query is bounded by the querying user's PostgreSQL role permissions, row-level security, and a usage budget. There is nothing to install: it is served by the existing REST API Lambda as a new `mcp` domain.

For the end-user walkthrough (how to connect a client), see [Querying Data with AI Assistants](../user-guide/ai-assistants.md).

## Endpoint & transport

| Property         | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| Endpoint         | `POST https://<your-gitgazer-domain>/api/mcp`           |
| Transport        | Streamable HTTP (JSON responses, stateless)             |
| Protocol version | `2026-07-28`, and `2025-11-25` for older clients        |
| Auth             | OAuth 2.1 Bearer access token (`Authorization: Bearer`) |

`<your-gitgazer-domain>` is the same host as the GitGazer web app (the CloudFront/custom domain).

The endpoint is served by the official MCP TypeScript SDK (`@modelcontextprotocol/server`), which
owns the wire format. It is **dual-era**, decided per request:

- A request carrying the per-request `_meta` envelope (`io.modelcontextprotocol/protocolVersion`)
  is served as `2026-07-28` by the SDK's `createMcpHandler`, including `server/discover` and the
  `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` header checks.
- Any other request is served as `2025-11-25` by a stateless SDK transport: `initialize` remains
  available but is not required before `tools/list` or `tools/call`, since no session is kept.

Responses are `application/json`. The one exception is a `2026-07-28` `subscriptions/listen`, which
the SDK always answers over SSE; the server advertises no list changes, so that stream closes
immediately with a complete result.

Clients must send `Accept: application/json, text/event-stream`, or the SDK answers `406`. Claude
Code and Claude Desktop already do.

## Authentication

The server is an OAuth 2.1 **Resource Server**, but Cognito on its own does not implement Dynamic Client Registration (RFC 7591), which MCP clients rely on for zero-configuration sign-in. To bridge that, GitGazer ships a small **OAuth authorization-server proxy** in front of Cognito. Clients discover it automatically and connect **without any manual client-ID entry**.

:::note
RFC 7591 Dynamic Client Registration is deprecated as of MCP `2026-07-28` in favour of Client ID
Metadata Documents. The registration shim below still works and remains supported for clients that
rely on it.
:::

```mermaid
sequenceDiagram
    participant C as MCP Client
    participant M as MCP endpoint (/api/mcp)
    participant P as OAuth proxy (/api/mcp/oauth/*)
    participant Cog as Cognito + GitHub

    C->>M: POST /api/mcp (no token)
    M-->>C: 401 + WWW-Authenticate: resource_metadata=…
    C->>M: GET /.well-known/oauth-protected-resource
    M-->>C: resource metadata (auth server = this origin)
    C->>P: GET /.well-known/oauth-authorization-server
    P-->>C: authorize / token / register endpoints (RFC 8414)
    C->>P: POST /api/mcp/oauth/register (DCR shim)
    P-->>C: returns a client_id
    Note over C: Generate PKCE challenge
    C->>P: GET /api/mcp/oauth/authorize (PKCE, redirect_uri)
    P->>Cog: 302 to Cognito authorize (GitHub IdP)
    Cog-->>C: Sign in with GitHub → code
    C->>P: GET /api/mcp/oauth/callback (relays code to client)
    C->>P: POST /api/mcp/oauth/token (code + verifier)
    P->>Cog: exchange at Cognito token endpoint
    Cog-->>C: access token
    C->>M: POST /api/mcp (Bearer token)
    M-->>C: tool results
```

Key points:

- **Discovery** follows the MCP spec: RFC 9728 Protected Resource Metadata → RFC 8414 Authorization Server Metadata → registration.
- The proxy is **stateless** — the client's `redirect_uri` and `state` are HMAC-signed into the Cognito `state` parameter, so no server-side session store is needed.
- **PKCE (S256)** is required; the MCP Cognito app client is a public client with no secret.
- The access token's audience is validated against the MCP (and web) Cognito client IDs. The token's `sub` is resolved to a GitGazer user, and the user's integrations become the tenant scope for every query.
- **Redirect allowlist**: the proxy only relays authorization codes to native-app loopback (`127.0.0.1`/`localhost`) and an operator-configurable set of hosted redirect hosts (default `vscode.dev`, `claude.ai`). This is the open-redirect guard — see [Configuration](#configuration).

## Tools

All tools are read-only and run under the `gitgazer_mcp` PostgreSQL role, scoped by row-level security to the caller's integrations.

| Tool             | Input       | Description                                        | Counts against budget |
| ---------------- | ----------- | -------------------------------------------------- | --------------------- |
| `run_sql`        | `{ sql }`   | Run a single read-only `SELECT` / `WITH … SELECT`. | ✅ yes                |
| `list_tables`    | —           | List the tables you may query (schema + name).     | ❌ no                 |
| `describe_table` | `{ table }` | List a table's columns (name, type, nullability).  | ❌ no                 |

`run_sql` returns the columns, rows, a `rowCount`, a `truncated` flag, and the query-time `budget` (see [Limits](#limits-and-budget)).

## Queryable data

Queries run against the `github` schema. Because no default `search_path` is set for the role, **tables must be schema-qualified** (`github.workflow_runs`, not `workflow_runs`).

| Table                               | Notes                                                          |
| ----------------------------------- | -------------------------------------------------------------- |
| `github.workflow_runs`              | GitHub Actions runs (`conclusion`, `status`, `created_at`, …). |
| `github.workflow_jobs`              | Jobs within runs.                                              |
| `github.workflow_run_pull_requests` | Join table between runs and pull requests.                     |
| `github.pull_requests`              | Pull requests.                                                 |
| `github.repositories`               | Repositories.                                                  |
| `github.organizations`              | Organizations.                                                 |
| `github.enterprises`                | Enterprises.                                                   |
| `github."user"`                     | GitHub users/actors. `user` is a reserved word — **quote it**. |
| `github.integrations`               | Column-scoped: only `integration_id`, `label`, `created_at`.   |

Not exposed: the `integrations.secret` webhook secret (revoked at the column level), the `gitgazer` application/PII schema (users, invitations, WebSocket connections, notification rules), and `github.pull_request_reviews`.

Example — failing runs per repository over the last week:

```sql
SELECT r.name AS repository, count(*) AS failures
FROM github.workflow_runs wr
JOIN github.repositories r
  ON r.integration_id = wr.integration_id AND r.id = wr.repository_id
WHERE wr.conclusion = 'failure'
  AND wr.created_at > now() - interval '7 days'
GROUP BY r.name
ORDER BY failures DESC
LIMIT 10;
```

Use `list_tables` and `describe_table` to discover the exact columns before writing a query.

## Security model

The raw-SQL path is defended in layers, so a crafted query cannot escape the caller's tenant or read data it was never granted:

1. **OAuth-validated identity** — a valid Cognito access token is required; the `sub` resolves to a GitGazer user and their integrations.
2. **Own login and role GRANTs** — queries run on a separate connection that logs in as `gitgazer_mcp` (IAM auth; `NOINHERIT`, not a superuser or table owner), so the session cannot switch to a role that owns the tables or bypasses RLS. This holds in the IAM connection mode used in AWS; the Data API mode (`DB_CONNECTION_MODE=data-api`) has no separate login. Its `GRANT SELECT` list _is_ the allowlist of readable tables and columns.
3. **Row-level security** — every exposed table carries a tenant policy keyed on `rls.integration_ids`; you only see rows for integrations you belong to.
4. **Read-only transaction** — `SET TRANSACTION READ ONLY`, and the transaction always ends in `ROLLBACK`; no writes or DDL.
5. **Single-statement guard** — the query is wrapped as a subquery whose byte budget and row cap are bind parameters. Bind parameters make the driver use the extended query protocol, in which Postgres refuses more than one statement, so statement stacking fails at the database. The wrap also gives the query a `SELECT` context, and a query that is not a single `SELECT`/`WITH` or that contains `;` is rejected before it runs.
6. **Blocked-function + escape guard** — `set_config` and `pg_settings`, functions that run a SQL string (`*_to_xml*`, `dblink*`, `ts_stat`, `ts_rewrite`), advisory locks (a session lock would outlive the transaction on the pooled connection), `pg_sleep*`, `pg_stat_*`, file, large-object and backend-control functions, nested block comments at the start of the query, and SQL-standard Unicode-escape syntax (`U&"…"`) are rejected. This is a blocklist: a mitigation, not a proof that `set_config` is unreachable.
7. **`set_config` stays executable** — migration `0056` attempts to revoke it, but on Aurora the revoke is a no-op (verified 2026-10-28): `set_config` is granted to `PUBLIC` by an owner the cluster user cannot override. The `rls.*` settings are therefore protected only by layers 5 and 6; a query that reached `set_config` could rewrite `rls.integration_ids` or `rls.integration_roles`.
8. **Resource caps** — a `statement_timeout`, a 2-second `lock_timeout`, a row cap and a result byte budget bound each query. The byte budget is enforced inside the query, so an oversized row never leaves the database.
9. **Per-user budget** — a rolling-window, query-time budget bounds how much `run_sql` execution time a user gets.

### Role-aware access

Besides the tenant list, each query transaction receives the caller's role per integration as `rls.integration_roles` (`<integration-uuid>:<role>` pairs joined by `,`). The SQL helper `github.mcp_has_role(integration_id, minimum_role)` returns `true` only when the caller holds at least `minimum_role` (`owner`, `admin`, `member`, `viewer`) in that integration, and `false` for unknown integrations, unknown roles, or an unset setting.

To open a table with a role requirement:

- **Row gate**: attach `mcpRolePolicy(minimumRole)` instead of `mcpTenantSeparationPolicy()`. It combines the tenant check with `github.mcp_has_role`.
- **Column gate**: expose the table through a view that returns admin-only columns only when `github.mcp_has_role(integration_id, 'admin')` and `NULL` otherwise, and grant `gitgazer_mcp` the view, never the base table: `run_sql` takes arbitrary SQL, so any grant on the admin-only column would let the caller read it directly. This rules out `security_invoker = true`, which needs exactly that grant. The view therefore runs as its owner, which owns the base table and is not subject to its RLS, so it must carry its own tenant filter on `rls.integration_ids` (or it returns every tenant's rows) and be `security_barrier`, so the planner cannot push a caller's predicate below that filter.
- **Global tables** (no `integration_id`): expose them only through a view scoped to the caller's integrations.

No table uses this yet. Role gates rely on `rls.integration_roles`, which only layers 5 and 6 protect (see layer 7); weigh that before opening a table with an admin-only gate.

## Limits and budget

| Limit             | Default                | Applies to         |
| ----------------- | ---------------------- | ------------------ |
| Row cap           | 1000 rows              | every `run_sql`    |
| Result size       | 128 KB                 | every `run_sql`    |
| Statement timeout | 20 seconds             | every `run_sql`    |
| Lock timeout      | 2 seconds              | every `run_sql`    |
| Query budget      | 600 query-seconds/hour | `run_sql` per user |

When more rows exist than the cap, or the rows exceed the result size, the result stops at the last row that fits and `truncated: true` is returned. A row that alone exceeds the result size is dropped and flagged the same way, even when it is the first row and the result is empty.

Each `run_sql` costs the duration of the query. Every `run_sql` result includes the query-time budget (all values in **seconds**):

```json
{
    "budget": {"limit": 600, "consumed": 12.481, "remaining": 587.519, "resetAt": "2026-07-21T15:00:00.000Z"}
}
```

A query is charged whether it succeeds or fails (including hitting the statement timeout), so expensive queries can't run for free. The window is a rolling `windowSeconds` (default 1 hour) that starts on a user's first query and resets once it elapses; exceeding the budget returns a tool error until then. The discovery tools (`list_tables` and `describe_table`) do not consume budget.

## Configuration

Application settings (convict; loaded from Secrets Manager, overridable by env var):

| Setting                    | Env var                          | Default                | Purpose                                                   |
| -------------------------- | -------------------------------- | ---------------------- | --------------------------------------------------------- |
| `mcpServerUrl`             | `MCP_SERVER_URL`                 | derived from domain    | Public MCP URL advertised in OAuth metadata.              |
| `mcpQuota.budgetSeconds`   | `MCP_QUERY_BUDGET_SECONDS`       | `600`                  | Query-time budget per window, per user (in seconds).      |
| `mcpQuota.windowSeconds`   | `MCP_QUERY_QUOTA_WINDOW_SECONDS` | `3600`                 | Budget window length, in seconds.                         |
| `mcpQuota.maxQuerySeconds` | `MCP_QUERY_MAX_SECONDS`          | `20`                   | Max duration of a single `run_sql` (statement timeout).   |
| `mcpAllowedRedirectHosts`  | `MCP_ALLOWED_REDIRECT_HOSTS`     | `vscode.dev,claude.ai` | Hosted OAuth redirect hosts (loopback is always allowed). |

Infrastructure (Terraform):

- `var.mcp_allowed_redirect_hosts` — feeds `mcpAllowedRedirectHosts`; add a client's hosted callback host here to onboard it without a code change.
- `var.mcp_throttling` — edge throttle on `POST /api/mcp` (default 20 req/s, burst 40).
- `aws_cognito_user_pool_client.mcp` — the public PKCE client; its ID is plumbed to the Lambda via Secrets Manager and handed to clients by the `/register` endpoint (no manual paste needed).

Database (Drizzle migrations):

- `0053` — creates the `gitgazer_mcp` role and per-table tenant policies.
- `0054` — grants `SELECT` on the nine exposed relations (column-scoped for `integrations`).
- `0055` — the `mcp_query_usage` quota table.
- `0056` — best-effort `REVOKE EXECUTE` on `set_config` (a no-op on Aurora).
- `20261028120000_mcp_has_role` — the `github.mcp_has_role` helper.
- `20261028130000_mcp_login` — lets `gitgazer_mcp` log in with IAM auth, for its own connection.

## Related

- [Querying Data with AI Assistants](../user-guide/ai-assistants.md) — connect a client and start asking questions.
- [Authentication & Authorization](./authentication.md) — the underlying Cognito + GitHub OAuth model.
