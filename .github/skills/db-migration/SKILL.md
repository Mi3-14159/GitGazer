---
name: db-migration
description: 'Create and apply Drizzle ORM database migrations for the GitGazer Aurora PostgreSQL database. Use when adding or altering tables/columns, adding indexes, creating PostgreSQL roles or grants, or generating and running migrations. Covers the two-schema layout (gitgazer + github), mandatory row-level-security (RLS) tenant-separation policies, the auto-applied grant model, custom SQL migrations, and the drizzle-kit generate/migrate workflow with IAM auth.'
license: MIT
---

# Database Migrations — GitGazer

Add or change database schema safely. GitGazer uses Drizzle ORM against Aurora PostgreSQL with **row-level security (RLS)** for multi-tenant isolation. Getting the RLS policy and tenant key right at table-creation time is the part that is easy to get wrong — this skill encodes the verified pattern.

## When to Use

- Adding a new table, column, index, or foreign key
- Creating a new PostgreSQL role or hand-writing GRANT/policy SQL
- Generating a migration from schema changes and applying it

## Key Facts (verified against the codebase)

- **Three schemas**: `gitgazer` (app data — [packages/db/src/schema/gitgazer.ts](../../../packages/db/src/schema/gitgazer.ts)), `github` (mirrored GitHub entities — [packages/db/src/schema/github/](../../../packages/db/src/schema/github/)) and `gitgazer_internal` (the MCP signing key and sign function; no role but its owner may use it, so never grant anything there). All are filtered in [packages/db/drizzle.config.ts](../../../packages/db/drizzle.config.ts) (`schemaFilter: ['gitgazer', 'gitgazer_internal', 'github']`).
- **Migrations are generated from the schema**, never hand-written for ordinary DDL. Output goes to [packages/db/drizzle/](../../../packages/db/drizzle/).
- **RLS is defined in the Drizzle schema**, not in raw SQL. drizzle-kit generates the `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` statements from the schema helpers. See the policy helpers in [packages/db/src/schema/github/misc.ts](../../../packages/db/src/schema/github/misc.ts).
- **Grants auto-apply** for `gitgazer_reader` and `gitgazer_writer`. `ALTER DEFAULT PRIVILEGES` was set once (migrations `0002`, `0024`, `0026`), so a new table in an existing schema **inherits their grants automatically** — do NOT add manual GRANT statements for them. `gitgazer_mcp` is deliberately left out: its `GRANT SELECT` list is the allowlist of what MCP callers can read, so exposing a table to the MCP needs an explicit grant (see below).
- **Roles**: `gitgazer_writer` (read/write), `gitgazer_reader` (read-only, the default), `gitgazer_mcp` (read-only, the MCP server's SQL surface). The app's transactions switch role per request — see `withRlsTransaction` in [packages/db/src/client.ts](../../../packages/db/src/client.ts). MCP queries instead run on their own connection that logs in as `gitgazer_mcp`, and its policies trust only a signed tenant context, not `rls.integration_ids` (see [apps/docs/docs/technical/mcp-server.md](../../../apps/docs/docs/technical/mcp-server.md), security model).

## The Tenant-Separation Rule (most important)

Any table holding tenant data **must**:

1. Have `integrationId` (`uuid`) referencing `integrations.integrationId` with `onDelete: 'cascade'`.
2. Use a **composite primary key with `integrationId` first**: `primaryKey({columns: [table.integrationId, table.id]})`.
3. Attach the policy helpers and call `.enableRLS()`:
    - `writerTenantSeparationPolicy()` — always
    - `readerTenantSeparationPolicy()` — always
    - `mcpTenantSeparationPolicy()` — **only** if the MCP server should expose it for read-only SQL (e.g. enterprises, organizations, repositories); use `mcpRolePolicy(minimumRole)` instead when only callers with at least that role in the integration may see the rows. Exposing a table also needs `GRANT SELECT ON <table> TO gitgazer_mcp` (column-scoped if it has secrets) in a custom migration, since no default privilege covers `gitgazer_mcp`. Admin-only columns go through a view, never a grant on the base table — see the column-gate pattern in the MCP server doc. To expose a `gitgazer` table to the MCP, add a `<table>_view` in the table's own schema (pattern in the MCP doc; `github.integration_ids` is the role function) and have the migration `REVOKE ALL` on the view from `gitgazer_reader` and `gitgazer_writer` (their default privileges would let them read it, or write through it as the owner and bypass RLS), and generate the snapshot offline with `packages/db/scripts/draft-migration.mts`.

Use the bundled template: [assets/tenant-table.template.ts](./assets/tenant-table.template.ts).

> A table without the policy helpers + `.enableRLS()` will leak across tenants (RLS off = all rows visible to every tenant). This is a 🔴 security blocker — flag it.

Non-tenant global tables (rare — e.g. `users`) omit `integrationId` and the policies. Follow the existing `users` table in [gitgazer.ts](../../../packages/db/src/schema/gitgazer.ts) for that case.

## Procedure: add / alter a table

```bash
cd packages/db   # drizzle-kit always runs from here (drizzle.config.ts + the drizzle-kit dep live here)

# 1. Edit the schema in packages/db/src/schema/ (use the tenant-table template).
#    - github entity  → packages/db/src/schema/github/*.ts
#    - app data       → packages/db/src/schema/gitgazer.ts
#    Add an entry to packages/db/src/schema/relations.ts (ONE central defineRelations()
#    call) if the table is queried with `.with`, + export the type if other code consumes it.

# 2. Generate the migration (diffs schema → SQL in packages/db/drizzle/)
npx drizzle-kit generate

# 3. REVIEW the generated SQL before applying. Confirm it contains, for a tenant table:
#      ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
#      CREATE POLICY "tenant separation writer" ... TO "gitgazer_writer" ...
#      CREATE POLICY "tenant separation reader" ... TO "gitgazer_reader" ...
#    and NO stray GRANT statements (grants are inherited).

# 4. Apply (needs DB access — IAM auth token via aws rds generate-db-auth-token,
#    RDS_* vars loaded from ENV_FILE; use aws-vault for credentials)
npx drizzle-kit migrate

# Optional: inspect with the GUI
npx drizzle-kit studio
```

## Procedure: custom SQL (new roles, grants, data backfill)

drizzle-kit cannot express new roles or one-off grants. Generate an **empty custom migration** and write the SQL by hand (see `0024_grant_permissions_to_new_users.sql`, `0044_iam.sql`):

```bash
cd packages/db
npx drizzle-kit generate --custom --name=<descriptive_name>
```

Then edit the new file under `packages/db/drizzle/`. Separate statements with `--> statement-breakpoint` (the repo uses `breakpoints: true`). Template: [assets/custom-migration.template.sql](./assets/custom-migration.template.sql).

## Checklist

- [ ] Tenant table has `integrationId` FK (`onDelete: 'cascade'`) + composite PK with `integrationId` first
- [ ] `writerTenantSeparationPolicy()` + `readerTenantSeparationPolicy()` attached and `.enableRLS()` called
- [ ] `mcpTenantSeparationPolicy()` / `mcpRolePolicy(minimumRole)` added only if the MCP server should expose the table, together with an explicit `GRANT SELECT ... TO gitgazer_mcp`
- [ ] Relation added to `packages/db/src/schema/relations.ts` if the table is queried with `.with`
- [ ] Generated SQL reviewed; no manual GRANTs for new tables apart from the `gitgazer_mcp` grant above
- [ ] Indexes are prefixed with `integrationId` for tenant-scoped lookups
- [ ] Migration applied locally and a query verified under `withRlsTransaction`

## Related

- Querying these tables safely → the `refactor` skill covers `withRlsTransaction` boundaries and the test mock pattern.
- Schema/type changes consumed elsewhere → export types from `packages/db` and import via `@gitgazer/db/*`.
