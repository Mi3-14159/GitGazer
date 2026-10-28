# Signed tenant context for MCP queries — design

## Why

MCP `run_sql` queries run on their own connection, logged in as `gitgazer_mcp`. Tenant separation for that role
comes from row-level security policies that read session settings the app writes before each query:
`rls.integration_ids` (which integrations the caller belongs to) and `rls.integration_roles` (the caller's role in
each). Any session can write such settings, the caller's own query included: Postgres does not tell the app's write
apart from the caller's. On Aurora the usual lock, revoking `EXECUTE` on `pg_catalog.set_config`, is impossible: the
function belongs to `rdsadmin` and is granted to `PUBLIC`, and the master user is `rds_superuser`, not a superuser
(verified in production on 2026-10-28). Parameter groups cannot restrict custom settings either.

So today the settings are protected only by the SQL guard in `packages/db/src/queries/readonlyQuery.ts` (single
statement, function blocklist, bound parameters). That guard has held up to review, but it is a text filter. Before
role-restricted configuration tables are opened to `run_sql`, the boundary must not depend on it.

## Goal

A tenant context the caller can overwrite but cannot make valid. The database trusts the context only when it carries
a signature that only the app can produce, bound to the current session and transaction. A missing, altered or
replayed context yields no rows, never other tenants' rows.

## Non-goals

- Changing the app's own roles (`gitgazer_reader`, `gitgazer_writer`) or their policies: they keep reading
  `rls.integration_ids` as today. Only the `gitgazer_mcp` policies change.
- Opening new tables. That comes after this, on top of it.
- Removing the SQL guard. It stays as defence in depth.
- Cognito token audience/scope (separate follow-up).

## Anti-goals

- **No secret in the repository, in a migration, or in Terraform state readable by the MCP role.**
- **Fail closed.** Any parse error, missing setting, wrong signature, other session or other transaction → the
  verified context is empty → policies match nothing.
- **No per-row signature check.** Verification runs once per statement, not once per row.

## Design (my calls, the owner opted out of the questions)

### Key

- A migration creates `gitgazer.mcp_context_key (id smallint primary key, key bytea not null)` and inserts one row
  with `gen_random_bytes(32)` (pgcrypto is installed, migration `20260228071606_prep`). The key is generated inside
  the database at migration time, so it never appears in the repo, in Terraform or in the app config.
- Only its owner (the migration user, `root`) can read it. Default privileges on schema `gitgazer` (migrations
  `20260228093008_grants`, `20260310163205_grant_permissions_to_new_users`) would give `SELECT` on every new table to
  `gitgazer_user`, `gitgazer_reader` and `gitgazer_writer`, so the migration revokes all privileges on the key table
  from those roles and `PUBLIC` explicitly (my call).

### Signing (app side, on the app's own connection)

- `gitgazer.mcp_sign_context(p_payload text, p_pid integer, p_txn_start timestamptz) RETURNS text`, `SECURITY
DEFINER`, owner `root`, `SET search_path = pg_catalog, pg_temp`. Returns the hex HMAC-SHA256 (pgcrypto `hmac`) over
  `p_payload || '|' || p_pid || '|' || <p_txn_start as text in a fixed format, e.g. extract(epoch …)>` with the key.
- `REVOKE EXECUTE … FROM PUBLIC` (we own this function, so the revoke takes effect on Aurora, unlike `set_config`), and
  no grant to `gitgazer_mcp`. The app calls it on the `db` connection, which must log in as the user that ran the
  migration (the owner). No guard checks this, as new environments may run migrations with a master user that is not
  called `root`; with another login, MCP queries fail closed.
- Flow in `runReadOnlyQuery`, inside the MCP transaction on `mcpDb`:
    1. `SELECT pg_backend_pid(), now()` on the MCP connection (the session and transaction the caller's query will run in).
    2. On the app connection: `SELECT gitgazer.mcp_sign_context($payload, $pid, $now)`.
    3. On the MCP connection: `SET LOCAL rls.mcp_context = '<payload>|<signature>'`, with the same validation as today
       before interpolation (UUIDs, `MEMBER_ROLES`, hex signature).
    4. Run the caller's query.
- Payload: the caller's role map in today's `rls.integration_roles` encoding (`<uuid>:<role>` joined by `,`). The ids
  are the map's keys, so one payload carries both.

### Verification (database side)

- `github.mcp_context() RETURNS TABLE (integration_id uuid, role text)`, `SECURITY DEFINER`, owner `root`, `STABLE`,
  `SET search_path = pg_catalog, pg_temp`, `EXECUTE` granted to `gitgazer_mcp`. It reads `rls.mcp_context`, splits
  payload and signature, recomputes the HMAC over payload, `pg_backend_pid()` and `now()` (transaction start; the
  caller cannot change either), and returns the payload's entries only on an exact match. Anything else returns no
  rows.
- `github.mcp_integration_ids(p_minimum_role text DEFAULT 'viewer') RETURNS uuid[]` — the ids from `mcp_context()`
  where the caller's role ranks at least `p_minimum_role` (owner > admin > member > viewer; unknown role → none).
- `github.mcp_has_role(integration_id, minimum_role)` is dropped (my call): it takes the row's `integration_id`, so a
  policy using it would re-verify the signature on every row (measured in PGlite: 501 verifications for 1000 rows).
  No table uses it yet.
- Replay: a context copied from another session or transaction fails because `pg_backend_pid()`/`now()` differ.
  Within its own transaction the caller already holds that context, so reusing it gains nothing.

### Policies

- `mcpTenantSeparationPolicy()` becomes `integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[])` and
  `mcpRolePolicy(minimumRole)` becomes the same with `github.mcp_integration_ids('<minimumRole>')`. The sub-select
  makes Postgres evaluate it once per statement (InitPlan, confirmed in PGlite), not per row; the `::uuid[]` cast is
  needed, without it Postgres reads `ANY (subquery)` and fails with `uuid = uuid[]`.
- Column gates in views use the same id lists (`CASE WHEN integration_id = ANY ((SELECT
github.mcp_integration_ids('admin'))::uuid[]) THEN … END`), never a per-row function call.
- The 10 existing `tenant separation mcp` policies are altered in the migration. The Drizzle schema
  (`packages/db/src/schema/github/misc.ts`) and the migration's `snapshot.json` must both carry the new expression, so
  a later `drizzle-kit generate` sees no drift (the migration is written by hand; `drizzle-kit generate` needs DB
  credentials).
- `withRlsTransaction` stops setting `rls.integration_roles` for the MCP path (nothing reads it any more); the reader
  and writer paths are unchanged.

### Data API mode (owner)

In `DB_CONNECTION_MODE=data-api` there is no separate MCP login (`mcpDb` is the app's client, logged in as `root`),
so a caller who got past the SQL guard could switch back to the login user and reach the key and the sign function.
MCP queries therefore refuse to run in that mode: `runReadOnlyQuery` throws before any SQL when the MCP client is
the app client, and the tool returns a clear error. The restriction is documented in
`apps/docs/docs/technical/mcp-server.md` (security model and configuration).

### Docs

`apps/docs/docs/technical/mcp-server.md` "Security model": the tenant context is signed; the SQL guard is defence in
depth again; how a forged context behaves (no rows).

## Tests

- PGlite (pgcrypto is available as a PGlite extension; if not, say so and verify by hand in dev):
  valid context → rows of the signed integrations only; payload altered → none; signature altered → none; context
  from another transaction (`now()` differs) → none; missing setting → none; `mcp_integration_ids('admin')` returns
  only integrations signed with admin or owner; `gitgazer_mcp`, `gitgazer_reader` and `gitgazer_writer` cannot read
  `mcp_context_key`; `gitgazer_mcp` cannot execute `mcp_sign_context`.
- EXPLAIN on a policy-protected table shows the verification as an InitPlan, not per row.
- Unit tests for the new flow in `runReadOnlyQuery` (sign call on the app connection, validation before interpolation).

## Deploy

The migration must run before the code deploys (CI runs no migrations): old code keeps working against the new
policies only if it sets `rls.mcp_context` — it doesn't, so after the migration and before the deploy, MCP queries
return no rows (fail closed, short window). Acceptable given current usage; the PR says so.

## Left to the builder

- Exact text format of `now()` in the signed string (must be identical on both sides; epoch microseconds suggested).
- File layout, function names beyond the ones above, and how the extra round trip on the app connection is wired.
