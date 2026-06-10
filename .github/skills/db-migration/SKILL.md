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

- **Two schemas**: `gitgazer` (app data — [packages/db/src/schema/gitgazer.ts](../../../packages/db/src/schema/gitgazer.ts)) and `github` (mirrored GitHub entities — [packages/db/src/schema/github/](../../../packages/db/src/schema/github/)). Both are filtered in [apps/api/drizzle.config.ts](../../../apps/api/drizzle.config.ts) (`schemaFilter: ['gitgazer', 'github']`).
- **Migrations are generated from the schema**, never hand-written for ordinary DDL. Output goes to [apps/api/drizzle/](../../../apps/api/drizzle/).
- **RLS is defined in the Drizzle schema**, not in raw SQL. drizzle-kit generates the `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` statements from the schema helpers. See the policy helpers in [packages/db/src/schema/github/misc.ts](../../../packages/db/src/schema/github/misc.ts).
- **Grants auto-apply.** `ALTER DEFAULT PRIVILEGES` was set once (migrations `0002`, `0024`, `0026`), so a new table in an existing schema **inherits grants automatically** — do NOT add manual GRANT statements for new tables.
- **Roles**: `gitgazer_writer` (read/write), `gitgazer_reader` (read-only, the default), `gitgazer_analyst` (read-only, analytics/Bedrock). The RLS transaction sets the role per request — see `withRlsTransaction` in [packages/db/src/client.ts](../../../packages/db/src/client.ts).

## The Tenant-Separation Rule (most important)

Any table holding tenant data **must**:

1. Have `integrationId` (`uuid`) referencing `integrations.integrationId` with `onDelete: 'cascade'`.
2. Use a **composite primary key with `integrationId` first**: `primaryKey({columns: [table.integrationId, table.id]})`.
3. Attach the policy helpers and call `.enableRLS()`:
    - `writerTenantSeparationPolicy()` — always
    - `readerTenantSeparationPolicy()` — always
    - `analystTenantSeparationPolicy()` — **only** if the analytics/Bedrock layer must read it (e.g. enterprises, organizations, repositories)

Use the bundled template: [assets/tenant-table.template.ts](./assets/tenant-table.template.ts).

> A table without the policy helpers + `.enableRLS()` will leak across tenants (RLS off = all rows visible to every tenant). This is a 🔴 security blocker — flag it.

Non-tenant global tables (rare — e.g. `users`) omit `integrationId` and the policies. Follow the existing `users` table in [gitgazer.ts](../../../packages/db/src/schema/gitgazer.ts) for that case.

## Procedure: add / alter a table

```bash
cd apps/api   # drizzle-kit always runs from here

# 1. Edit the schema in packages/db/src/schema/ (use the tenant-table template).
#    - github entity  → packages/db/src/schema/github/*.ts
#    - app data       → packages/db/src/schema/gitgazer.ts
#    Add relations() + export the type if other code consumes it.

# 2. Generate the migration (diffs schema → SQL in apps/api/drizzle/)
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
cd apps/api
npx drizzle-kit generate --custom --name=<descriptive_name>
```

Then edit the new file under `apps/api/drizzle/`. Separate statements with `--> statement-breakpoint` (the repo uses `breakpoints: true`). Template: [assets/custom-migration.template.sql](./assets/custom-migration.template.sql).

## Checklist

- [ ] Tenant table has `integrationId` FK (`onDelete: 'cascade'`) + composite PK with `integrationId` first
- [ ] `writerTenantSeparationPolicy()` + `readerTenantSeparationPolicy()` attached and `.enableRLS()` called
- [ ] `analystTenantSeparationPolicy()` added only if analytics needs read access
- [ ] `relations()` defined if the table is queried with `.with`
- [ ] Generated SQL reviewed; no manual GRANTs for new tables
- [ ] Indexes are prefixed with `integrationId` for tenant-scoped lookups
- [ ] Migration applied locally and a query verified under `withRlsTransaction`

## Related

- Querying these tables safely → the `refactor` skill covers `withRlsTransaction` boundaries and the test mock pattern.
- Schema/type changes consumed elsewhere → export types from `packages/db` and import via `@gitgazer/db/*`.
