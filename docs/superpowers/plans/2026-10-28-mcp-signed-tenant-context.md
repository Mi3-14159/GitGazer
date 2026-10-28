# Signed MCP Tenant Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP queries see only the integrations in a tenant context the app signed for this session and transaction,
so an overwritten `rls.*` setting yields no rows instead of other tenants' rows.

**Architecture:** A migration adds a database-generated HMAC key, a signing function only the app login may run, and
a `SECURITY DEFINER` verifier that the `gitgazer_mcp` policies read once per statement. `runReadOnlyQuery` gets the
MCP session's pid and transaction start, has the context signed on the app connection, and sets `rls.mcp_context`
before running the caller's SQL. MCP queries refuse to run in Data API mode.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL (Aurora, pgcrypto), PGlite for database tests, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-28-mcp-signed-tenant-context-design.md](../specs/2026-10-28-mcp-signed-tenant-context-design.md)

## Global Constraints

- No secret in the repository, in a migration, or in Terraform: the key is `gen_random_bytes(32)` generated inside the migration.
- Fail closed: missing/unparsable setting, wrong signature, other session or other transaction → verified context empty → no rows.
- Verification runs once per statement (InitPlan), never per row: policies use `integration_id = ANY ((SELECT github.mcp_integration_ids(...))::uuid[])`.
- Only the `gitgazer_mcp` policies change; `gitgazer_reader`/`gitgazer_writer` policies and `rls.integration_ids` for the app paths stay as they are.
- The SQL guard in `readonlyQuery.ts` stays unchanged (defence in depth).
- MCP queries refuse to run in Data API mode (`DB_CONNECTION_MODE=data-api`), with a clear error, before any SQL; documented.
- Role order owner > admin > member > viewer (as `ROLE_RANK` in `packages/db/src/types/members.ts`); unknown role → no ids.
- Migrations are written by hand (drizzle-kit needs DB credentials); `snapshot.json` must carry the new policy expressions.
- Keep the code as simple as possible. Comment only non-obvious why. Commits one line `type: description`, no body, no trailers, no mention of Claude/AI.

## Review Focus

1. Signing fails on the app connection (DB error): the caller's SQL must not run unsigned; the tool returns an error. Pinned in Task 2.
2. Caller with no integrations: an empty signed payload returns no rows and no error. Pinned in Task 1 (SQL) and Task 2 (flow).
3. Two MCP queries in the same Lambda environment (pool of 2): each context is bound to its own pid and transaction; one cannot use the other's. Pinned in Task 1 (other pid/transaction → none).
4. Migration run by a user other than the app login: the migration fails instead of locking the app out. Pinned in Task 1.
5. Data API mode: clear error before any SQL. Pinned in Task 2.

---

### Task 1: Key, signing, verification and policies in the database

**Files:**

- Create: `packages/db/drizzle/20261029090000_mcp_signed_context/migration.sql`, `.../snapshot.json` (copy of `20261028130000_mcp_login/snapshot.json` with new `id`, `prevIds` → that snapshot's id, and the 10 `tenant separation mcp` policies' `using` updated)
- Modify: `packages/db/src/schema/github/misc.ts` (`mcpTenantSeparationPolicy`, `mcpRolePolicy`)
- Modify: `packages/db/src/schema/github/misc.test.ts`
- Delete: `packages/db/src/queries/mcp-has-role.test.ts`
- Create: `packages/db/src/queries/mcp-context.test.ts` (PGlite)

**Interfaces:**

- Produces (SQL):
    - `gitgazer.mcp_context_key (id smallint PRIMARY KEY, key bytea NOT NULL)`, one row, `gen_random_bytes(32)`; `REVOKE ALL … FROM PUBLIC, gitgazer_user, gitgazer_reader, gitgazer_writer`.
    - `gitgazer.mcp_sign_context(p_payload text, p_pid integer, p_txn_start_us bigint) RETURNS text` — `SECURITY DEFINER`, `SET search_path = pg_catalog, pg_temp`; returns `encode(public.hmac(p_payload || '|' || p_pid || '|' || p_txn_start_us, key, 'sha256'), 'hex')`; `REVOKE EXECUTE … FROM PUBLIC`.
    - `github.mcp_context() RETURNS TABLE (integration_id uuid, role text)` — `SECURITY DEFINER`, `STABLE`, same `search_path`; reads `current_setting('rls.mcp_context', true)` = `<payload>|<64 hex>`; recomputes the HMAC over payload, `pg_backend_pid()` and `(extract(epoch FROM now()) * 1000000)::bigint`; on exact match returns one row per `<uuid>:<role>` entry of the payload, otherwise none (any parse/cast failure → none, never an error). `GRANT EXECUTE … TO gitgazer_mcp`.
    - `github.mcp_integration_ids(p_minimum_role text DEFAULT 'viewer') RETURNS uuid[]` — `STABLE`; array of ids from `mcp_context()` whose role ranks at least `p_minimum_role`; unknown `p_minimum_role` or role → excluded. `GRANT EXECUTE … TO gitgazer_mcp`.
    - `DROP FUNCTION github.mcp_has_role(uuid, text)`.
    - The 10 `tenant separation mcp` policies: `USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]))`.
    - Guard at the top of the migration: `DO $$ BEGIN IF current_user <> '<app login>' … RAISE EXCEPTION …` — the app login is the master user `root` (`RDS_DB_USER = module.db.cluster_master_username`); compare against `'root'`.
- Produces (TS): `mcpTenantSeparationPolicy()` and `mcpRolePolicy(minimumRole: MemberRole)` with the expressions above (`mcp_integration_ids('<minimumRole>')` for the role variant).
- Payload encoding (also used by Task 2): role map entries `<lowercase uuid>:<role>` joined by `,`; empty map → empty string.

- [ ] **Step 1: Write the failing PGlite tests** in `mcp-context.test.ts`. Setup: create schemas `github`/`gitgazer`, roles `gitgazer_mcp`, `gitgazer_user`, `gitgazer_reader`, `gitgazer_writer`, `root`; load pgcrypto (PGlite contrib); run the migration file's SQL (read from disk, as the old `mcp-has-role.test.ts` did) — skip the `current_user` guard by running as a role named `root` or by stripping the guard block in the test only; create a small `github.t (integration_id uuid, v int)` with RLS and the new mcp policy and rows for integrations A, B, C. Helper `sign(payload)` calls `gitgazer.mcp_sign_context(payload, pg_backend_pid(), (extract(epoch FROM now())*1000000)::bigint)` and sets `rls.mcp_context` in the same transaction, then `SET LOCAL ROLE gitgazer_mcp`. Cases (each asserts the selected `v`s):
    - signed `A:viewer,B:admin` → rows of A and B only
    - payload changed after signing to `A:viewer,B:admin,C:viewer` → none
    - signature changed (one hex digit) → none
    - setting unset → none; setting `garbage` → none (no error)
    - context signed in one transaction, set again in a later transaction → none
    - context signed for another pid (pass `pg_backend_pid() + 1`) → none
    - signed empty payload → none, no error
    - `mcp_integration_ids('admin')` with `A:member,B:admin,C:owner` → `{B, C}`; with `'nonsense'` → `{}`
    - as `gitgazer_mcp`: `SELECT * FROM gitgazer.mcp_context_key` → permission denied; `SELECT gitgazer.mcp_sign_context('x', 1, 1)` → permission denied; as `gitgazer_reader`/`gitgazer_writer`: reading the key table → permission denied
    - `EXPLAIN (COSTS OFF) SELECT * FROM github.t` as `gitgazer_mcp` contains `InitPlan`
    - migration guard: running the migration as a user other than `root` raises

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/db && pnpm exec vitest run src/queries/mcp-context.test.ts`
Expected: FAIL (migration file missing).

- [ ] **Step 3: Write the migration, update `misc.ts`, the snapshot and `misc.test.ts`**

`misc.test.ts` asserts the rendered `using` of both factories contains `github.mcp_integration_ids()` / `github.mcp_integration_ids('admin')` and `::uuid[]`, and no longer `mcp_has_role`. Delete `mcp-has-role.test.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec nx run-many -t test:unit lint pretty:check -p @gitgazer/db` and `cd packages/db && pnpm exec tsc --noEmit --ignoreDeprecations 6.0 --pretty false -p tsconfig.json` (no output).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle/20261029090000_mcp_signed_context packages/db/src/schema/github packages/db/src/queries/mcp-context.test.ts packages/db/src/queries/mcp-has-role.test.ts
git commit -m "feat: verify a signed tenant context in the mcp row level security policies"
```

---

### Task 2: Sign the context in `runReadOnlyQuery`, refuse Data API mode, docs

**Files:**

- Modify: `packages/db/src/client.ts` (export `hasSeparateMcpLogin`; drop the `integrationRoles` option of `withRlsTransaction`)
- Modify: `packages/db/src/queries/readonlyQuery.ts`
- Modify: `packages/db/src/queries/readonly-query.test.ts` (PGlite), `packages/db/src/client.test.ts`
- Modify: `apps/lambdas/api/src/domains/mcp/readonly-query.test.ts`, `apps/lambdas/api/src/domains/mcp/rls-transaction.test.ts`
- Modify: `apps/docs/docs/technical/mcp-server.md`

**Interfaces:**

- Consumes: Task 1's SQL functions and payload encoding.
- Produces: `hasSeparateMcpLogin(): boolean` in `packages/db/src/client.ts` — true only after `initDb()` in `rds-proxy` mode. `withRlsTransaction` no longer accepts `integrationRoles` (MCP was its only user).
- `runReadOnlyQuery(params)` keeps its signature. New flow inside the MCP transaction callback, before the caller's SQL:
    1. `SELECT pg_backend_pid() AS pid, (extract(epoch FROM now()) * 1000000)::bigint::text AS txn_start_us` on `tx`.
    2. On `db` (app connection): `SELECT gitgazer.mcp_sign_context(${payload}, ${pid}, ${txnStartUs}::bigint) AS signature` (bound parameters).
    3. Validate `signature` against `/^[0-9a-f]{64}$/`, then `SET LOCAL rls.mcp_context = '<payload>|<signature>'` on `tx` (payload is built only from already-validated UUIDs and `MEMBER_ROLES`).
- MCP calls `withRlsTransaction` with `integrationIds: []` and no role map; nothing on the MCP path reads `rls.integration_ids` any more.
- Before any SQL: if `!hasSeparateMcpLogin()`, throw `ReadOnlyQueryError('run_sql is not available in Data API mode: MCP queries need the separate gitgazer_mcp login (DB_CONNECTION_MODE=rds-proxy).')`.

- [ ] **Step 1: Write the failing tests**
    - `apps/lambdas/api/src/domains/mcp/readonly-query.test.ts` (mocked `withRlsTransaction`, `db`, `hasSeparateMcpLogin`): signs on `db` with the payload `'<id>:member'`, the pid and txn start returned by the first `tx.execute`; sets `rls.mcp_context` to `'<payload>|<signature>'` before the wrapped query; a signing error rejects and the caller's query is never executed; a signature that is not 64 hex chars rejects before `SET LOCAL`; `hasSeparateMcpLogin() === false` → `ReadOnlyQueryError` matching `/Data API mode/` and `withRlsTransaction` not called; empty role map → payload `''` and the query still runs.
    - `apps/lambdas/api/src/domains/mcp/rls-transaction.test.ts`: remove the `integrationRoles` cases.
    - `packages/db/src/client.test.ts`: `hasSeparateMcpLogin()` is true after `initDb()` in rds-proxy mode and false in data-api mode.
    - `packages/db/src/queries/readonly-query.test.ts` (PGlite end to end): mock `db` with a second PGlite instance that holds the same key table row as `mcpDb`'s (insert a fixed test key into both — the app connection and the MCP connection are different databases in this test, so pass the key explicitly instead of running the migration's `gen_random_bytes`), and a policy-protected table with rows of two integrations; `runReadOnlyQuery` with `{A: 'member'}` returns only A's rows; existing PGlite cases keep passing.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/lambdas/api && pnpm exec vitest run src/domains/mcp/readonly-query.test.ts src/domains/mcp/rls-transaction.test.ts` and `cd packages/db && pnpm exec vitest run src/client.test.ts src/queries/readonly-query.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the flow, `hasSeparateMcpLogin`, the Data API refusal; remove the `integrationRoles` option**

Update the `runReadOnlyQuery` defence-in-depth comment: layer 4 now names the signed context; the guard is defence in depth again.

- [ ] **Step 4: Update the docs** (`apps/docs/docs/technical/mcp-server.md`)

Security model: replace the `rls.integration_ids`/`rls.integration_roles` layers with the signed context (key in the database, signing only by the app login, verification once per statement, forged or replayed context → no rows); layer 7 (`set_config`) now says the setting can be written but not made valid. Role-aware access: `mcpRolePolicy` uses `mcp_integration_ids('<role>')`; column gates use `CASE WHEN integration_id = ANY ((SELECT github.mcp_integration_ids('admin'))::uuid[]) THEN … END`; remove `mcp_has_role`. Add the Data API restriction to the security model and the configuration section. Migrations list: add `20261029090000_mcp_signed_context`; mark `mcp_has_role` as replaced.

- [ ] **Step 5: Run all checks**

Run: `pnpm exec nx run-many -t test:unit lint pretty:check build -p @gitgazer/db @gitgazer/lambda-api`, `pnpm exec prettier --check apps/docs/docs/technical/mcp-server.md`, and both typechecks (`packages/db`: no output; `apps/lambdas/api`: `... | grep "error TS" | grep -v "TS6059\|TS6307"` prints nothing).
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src apps/lambdas/api/src/domains/mcp apps/docs/docs/technical/mcp-server.md
git commit -m "feat: sign the mcp tenant context per query and refuse data api mode"
```

---

## Deploy

Apply `20261029090000_mcp_signed_context` right before the deploy: between migration and deploy, MCP queries return no rows (fail closed). The PR description says so.
