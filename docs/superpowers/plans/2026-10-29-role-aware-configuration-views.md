# Role-aware Configuration Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP callers can read GitGazer's configuration tables through one role-aware view per table, showing what the API shows them, and the signed tenant context loses its `mcp_` names so the API can use it later.

**Architecture:** One custom migration renames the signed-context objects (keeping their OIDs, so existing policies keep working) and creates 13 `security_barrier` views in schema `github`, owned by the migration user, that filter rows with `github.integration_ids(<role>)` and blank limited columns with `CASE`. `gitgazer_mcp` gets `SELECT` on the views only. The API masks emails below admin to match.

**Tech Stack:** PostgreSQL 17 (Aurora), Drizzle ORM / drizzle-kit `1.0.0-rc.5`, PGlite (+ pgcrypto) for DB tests, Vitest, Hono, Vue 3.

**Spec:** `docs/superpowers/specs/2026-10-28-mcp-configuration-views-design.md`

## Global Constraints

- No grant for `gitgazer_mcp` on any `gitgazer` base table, and no `USAGE` on schema `gitgazer`. `gitgazer_mcp` gets `SELECT` on the new views only.
- Every new view: schema `github`, plain (not `security_invoker`), `security_barrier = true`, one base table, no columns from another table.
- The role function is always called through a sub-select: `integration_id = ANY ((SELECT github.integration_ids('<role>'))::uuid[])`.
- Renames, verbatim: `github.mcp_integration_ids` → `github.integration_ids`, `github.mcp_context` → `github.signed_context`, `gitgazer.mcp_sign_context` → `gitgazer.sign_context`, `gitgazer.mcp_context_key` → `gitgazer.context_key`, setting `rls.mcp_context` → `rls.signed_context`. `gitgazer_mcp` and `mcpTenantSeparationPolicy` keep their names.
- Test roles mirror prod: `root` (superuser, owns everything), `gitgazer_reader`, `gitgazer_writer`, `gitgazer_mcp`. There is no `gitgazer_user`.
- Migrations are hand-written; drizzle-kit's CLI needs DB credentials. The snapshot is generated offline (Task 1).
- Never write personal setup (AWS profile names, ARNs, account ids, hostnames) into committed files.
- Comments only for a non-obvious why; keep code as simple as possible.
- Run Prettier and ESLint on changed files before each commit; commits are one-line conventional commits, no trailers.

## Review Focus

1. A caller with different roles per integration (admin in A, viewer in B) sees A's limited columns filled and B's `NULL` in the same view. Pinned in Task 2.
2. A forged, unsigned or missing `rls.signed_context` yields zero rows from every view, not an error. Pinned in Task 2.
3. `list_tables`/`describe_table` read `information_schema`; the views must show up there for `gitgazer_mcp` and no `gitgazer` table may. Pinned in Task 2.
4. A user or Slack workspace shared with another tenant: `users`, `slack_workspaces.installed_by` must not reveal the other tenant's people. Pinned in Task 2.
5. A member (not admin) looking at pending invitations must not see "Link-only invitation" for an emailed invitation whose email is now hidden. Pinned in Task 3.

---

### Task 1: Generic names for the signed context

**Files:**

- Create: `packages/db/scripts/draft-migration.mts`
- Create: `packages/db/drizzle/20261029120000_role_aware_views/migration.sql`, `.../snapshot.json`
- Modify: `packages/db/src/schema/gitgazer.ts:60-67` (table `mcpContextKey` → `contextKey`, name `context_key`)
- Modify: `packages/db/src/schema/github/misc.ts` (`mcp_integration_ids` → `integration_ids` in both policy helpers), `packages/db/src/schema/github/misc.test.ts`
- Modify: `packages/db/src/queries/readonlyQuery.ts` (`gitgazer.sign_context`, `rls.signed_context`, comments naming the old objects)
- Modify: `packages/db/src/queries/mcp-context.test.ts`, `packages/db/src/queries/readonly-query.test.ts`, `apps/lambdas/api/src/domains/mcp/mcp.tools.test.ts`, `apps/lambdas/api/src/domains/mcp/readonly-query.test.ts` (new names)

**Interfaces:**

- Produces: SQL functions `github.integration_ids(p_minimum_role text DEFAULT 'viewer')`, `github.signed_context()`, `gitgazer.sign_context(p_payload text, p_pid integer, p_txn_start_us bigint)`, table `gitgazer.context_key`, setting `rls.signed_context`; Drizzle export `contextKey`; the script `packages/db/scripts/draft-migration.mts`.

- [ ] **Step 1: Write the offline snapshot script `packages/db/scripts/draft-migration.mts`**

Usage: `../../node_modules/.bin/jiti scripts/draft-migration.mts <previous snapshot.json> <new snapshot.json>` from `packages/db`. It imports `./src/schema/index.ts`, calls `generateDrizzleJson(schema, prev.id, ['gitgazer', 'github'])` and `generateMigration(prev, cur)` from `drizzle-kit/api-postgres`, writes `cur` (pretty JSON, 2-space indent) to the second path and prints the SQL statements. It needs no DB or AWS credentials. Verify on the current tree: with `drizzle/20261029090000_mcp_signed_context/snapshot.json` and a scratch output path it prints `[]`.

- [ ] **Step 2: Update the tests to the new names (failing)**

In `mcp-context.test.ts` and `packages/db/src/queries/readonly-query.test.ts`, apply `drizzle/20261029120000_role_aware_views/migration.sql` after the `20261029090000` migration (in `readonly-query.test.ts`, with the same `ALTER POLICY`/`DROP FUNCTION` filtering applied to both files, and the fixed-key replacement still applied to the first). Both tests skip the new migration's `CREATE VIEW` and `GRANT SELECT ON github.` statements, which Task 2 adds and which need the base tables; the views are tested in Task 2. Replace every old name with the new one, including `set_config('rls.signed_context', …)`, the privilege tests (`gitgazer.context_key`, `sign_context`, `signed_context`, `integration_ids`) and the policy check (`qual` contains `github.integration_ids()`). In `misc.test.ts` expect `(SELECT github.integration_ids())::uuid[]` and `(SELECT github.integration_ids('admin'))::uuid[]`. In the two api tests, update the sign query text and error message strings that name `mcp_sign_context`. Add to `mcp-context.test.ts`:

```ts
it('keeps the existing mcp policies working after the rename', async () => {
    expect(await visible(async (tx) => setContext(tx, await sign(tx, `${A}:viewer`)))).toEqual([1]);
});
it('ignores the old setting name', async () => {
    const old = async (tx: Transaction) => {
        const context = await sign(tx, `${A}:viewer`);
        await tx.query(`SELECT set_config('rls.mcp_context', $1, true)`, [context]);
    };
    expect(await visible(old)).toEqual([]);
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd packages/db && pnpm exec vitest run src/queries src/schema`
Expected: FAIL (migration file missing / functions not found).

- [ ] **Step 4: Write the migration and code changes**

`migration.sql` (statements separated by `--> statement-breakpoint`), in this order:

1. `ALTER TABLE gitgazer.mcp_context_key RENAME TO context_key;`
2. `ALTER FUNCTION` … `RENAME TO` for the three functions (same signatures as in `20261029090000_mcp_signed_context/migration.sql`). Renaming keeps the OIDs, so the 10 `tenant separation mcp` policies keep working.
3. `CREATE OR REPLACE FUNCTION` for each renamed function with the same signature, attributes (`SECURITY DEFINER`, `STABLE`, `SET search_path = pg_catalog, pg_temp`, …) and body as in `20261029090000`, except that bodies now reference `gitgazer.context_key`, `rls.signed_context` and `github.signed_context()`. `CREATE OR REPLACE` keeps OIDs and grants.

Update `gitgazer.ts`, `misc.ts` and `readonlyQuery.ts` to the new names. Then generate the snapshot: `jiti scripts/draft-migration.mts drizzle/20261029090000_mcp_signed_context/snapshot.json drizzle/20261029120000_role_aware_views/snapshot.json`. The printed SQL (a drop/create for the table, policy changes) is not used: the hand-written rename replaces it, and the policies' stored expressions follow the rename by OID.

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `cd packages/db && pnpm exec vitest run` and `pnpm nx run-many -t typecheck -p @gitgazer/db @gitgazer/lambda-api`, then the api unit tests (`cd apps/lambdas/api && pnpm run test:unit`).
Expected: all PASS.

- [ ] **Step 6: Commit**

`git commit -m "refactor(db): give the signed tenant context generic names"`

### Task 2: The 13 role-aware views

**Files:**

- Create: `packages/db/src/schema/github/views.ts`; export it from `packages/db/src/schema/github/index.ts`
- Modify: `packages/db/drizzle/20261029120000_role_aware_views/migration.sql` (append), `.../snapshot.json` (regenerate)
- Create: `packages/db/src/queries/configuration-views.test.ts`

**Interfaces:**

- Consumes: `github.integration_ids(role)`, `gitgazer.sign_context`, `rls.signed_context` (Task 1).
- Produces: Drizzle views (camelCase exports of the names below) in `views.ts`; SQL views `github.integration_apps`, `github.integration_app_github_settings`, `github.integration_app_slack_settings`, `github.notification_handles`, `github.webhook_handle_details`, `github.slack_handle_details`, `github.notification_rules`, `github.notification_rule_destinations`, `github.integration_invitations`, `github.event_log_entries`, `github.user_assignments`, `github.users`, `github.slack_workspaces`.

- [ ] **Step 1: Write the failing test `configuration-views.test.ts`**

Setup follows `mcp-context.test.ts`: PGlite with pgcrypto, the prod roles, schemas `github` and `gitgazer`, `GRANT USAGE ON SCHEMA github TO gitgazer_mcp`, the `20261029090000` migration (minus `ALTER POLICY` and `DROP FUNCTION` statements), stand-in base tables created by hand with exactly the columns and types from `packages/db/src/schema/gitgazer.ts` and `github."user-assignments"` (no RLS), then the `20261029120000` migration. Seed integrations A, B and C, where the caller is `admin` in A, `viewer` in B and has no role in C. Each table gets a row per integration with a non-null value in every limited column. Users: `u1` in A, `u2` in B, `u3` only in C. Workspace `T1` linked to A and installed by `u3`; workspace `T2` linked only to C.

Query each view as `gitgazer_mcp` inside a transaction that signs `A:admin,B:viewer` (helper `asCaller(roles, sql)`). Tests:

```ts
it.each(viewerViews)('%s returns the rows of A and B only', ...)           // integration_id set == {A, B}
it('integration_app_github_settings.secret is set for A and NULL for B', ...)
it('webhook_handle_details.url is set for A and NULL for B', ...)
it('integration_invitations: rows only where the caller is member+, token and email only for admin+', ...)
// sign A:admin,B:viewer -> only A's rows, invite_token and email set; sign A:member -> A's row, both NULL
it('users returns u1 and u2 only, email only for u1', ...)
it('slack_workspaces returns T1 only, with installed_by NULL because u3 is in C only', ...)
it.each(allViews)('%s returns nothing for an unsigned or forged context', ...)
it('every new view is security_barrier and not security_invoker', ...)       // pg_class.reloptions
it('lists the views, and no gitgazer table, in information_schema for gitgazer_mcp', ...)
it('gives gitgazer_mcp no privilege on any gitgazer table and no USAGE on gitgazer', ...)
it('exposes no column outside the spec', ...)  // users has no cognito_id/github_id, slack_workspaces no bot_token_ciphertext
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/db && pnpm exec vitest run src/queries/configuration-views.test.ts`
Expected: FAIL (`relation "github.integration_apps" does not exist`).

- [ ] **Step 3: Define the views in `views.ts`**

`githubSchema.view('<name>', {<columns>}).with({securityBarrier: true}).as(sql\`…\`)`, with the column types copied from the base tables. Two small module-local helpers produce the fragments: `rowsFor(minimumRole: MemberRole)`→`integration_id = ANY ((SELECT github.integration_ids('<role>'))::uuid[])`, and `onlyFor(minimumRole: MemberRole, column: string)`→`CASE WHEN <rowsFor> THEN <column> END AS <column>`. Rows and limits per view are the spec's table ("Rows for", "Column limits"). The global tables use these filters:

```sql
-- github.users
WHERE id IN (SELECT user_id FROM github."user-assignments" WHERE <rowsFor('viewer')>)
-- email:      CASE WHEN id IN (SELECT user_id FROM github."user-assignments" WHERE <rowsFor('admin')>) THEN email END
-- github.slack_workspaces
WHERE team_id IN (SELECT team_id FROM gitgazer.integration_app_slack_settings WHERE <rowsFor('viewer')>)
-- installed_by: CASE WHEN installed_by IN (SELECT user_id FROM github."user-assignments" WHERE <rowsFor('viewer')>) THEN installed_by END
```

- [ ] **Step 4: Append to the migration and regenerate the snapshot**

Run `jiti scripts/draft-migration.mts drizzle/20261029090000_mcp_signed_context/snapshot.json drizzle/20261029120000_role_aware_views/snapshot.json`. Append the printed `CREATE VIEW` statements to `migration.sql` after Task 1's statements, each followed by `GRANT SELECT ON github.<view> TO gitgazer_mcp;`. If drizzle-kit cannot express a view correctly (no `security_barrier`, wrong quoting), write that `CREATE VIEW` by hand and say why in the report. Then rerun the script with the new snapshot as the previous one: it must print `[]`.

- [ ] **Step 5: Run the tests**

Run: `cd packages/db && pnpm exec vitest run`, then typecheck as in Task 1.
Expected: all PASS.

- [ ] **Step 6: Commit**

`git commit -m "feat(db): add role-aware configuration views for the mcp"`

### Task 3: Emails for admins only in the API

**Files:**

- Modify: `apps/lambdas/api/src/domains/members/members.routes.ts`, `members.controller.ts`; tests `members.routes.test.ts`, `members.controller.test.ts`
- Modify: `apps/web/src/components/users/PendingInvitationCard.vue`

**Interfaces:**

- Produces: `getMembers(params: {integrationId: string; integrationIds: string[]; canSeeEmails: boolean})`.

- [ ] **Step 1: Write the failing tests**

- `GET /integrations/:id/members` as a `viewer` and as a `member`: every `user.email` is `null`. As `admin` and `owner`: the emails are returned.
- `GET /integrations/:id/invitations` as a `member`: each invitation's `email`, `invitedByUser.email` and `invitee.email` are `null` (and `inviteToken` stays absent, as today). As `admin`: all present.

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lambdas/api && pnpm run test:unit`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

The members route passes `canSeeEmails: callerRole !== undefined && hasRole(callerRole, 'admin')` to `getMembers`, which maps `user.email` to `null` when false. The invitations route, in its existing non-admin branch, also nulls `email`, `invitedByUser.email` and `invitee.email`. In `PendingInvitationCard.vue`, show `invitation.email || (readonly ? 'Pending invitation' : 'Link-only invitation')`, and hide the link-only marker (`v-if="!invitation.email"`) when `readonly`.

- [ ] **Step 4: Run tests, web typecheck, lint**

Run: api unit tests; `cd apps/web && pnpm exec vue-tsc --noEmit`; Prettier and ESLint on the changed files.
Expected: PASS, clean.

- [ ] **Step 5: Commit**

`git commit -m "fix(members): show member and invitation emails to admins only"`

### Task 4: Tool description and docs

**Files:**

- Modify: `apps/lambdas/api/src/domains/mcp/mcp.tools.ts` (the `run_sql` description), `apps/lambdas/api/src/domains/mcp/mcp.tools.test.ts`
- Modify: `apps/docs/docs/technical/mcp-server.md`, `.github/skills/db-migration/SKILL.md`

- [ ] **Step 1: Update the `run_sql` description**

It names the readable tables. Add the 13 views, grouped, and one sentence: "Configuration views show only what your role in each integration allows; columns you may not see are NULL." Keep the existing test that checks the description (if any) in step with it.

- [ ] **Step 2: Update the docs**

In `mcp-server.md`:

- Table list: the 13 views with one line each.
- "Not exposed": now only the `gitgazer` base tables, the Slack bot token, `cognito_id`/`github_id`, the quota table and the key.
- "Role-aware access": the new function names, "No table uses a role gate yet" replaced by a pointer to the views, and the deploy note that MCP queries return no rows between the migration and the deploy.

In `SKILL.md`: the renamed function, and a line on exposing a `gitgazer` table to the MCP through a view in `github` (pattern in the MCP doc) plus `scripts/draft-migration.mts` for generating the snapshot offline.

- [ ] **Step 3: Verify and commit**

Run: api unit tests; `pnpm exec prettier --check` on the changed files.
`git commit -m "docs(mcp): document the role-aware configuration views"`
