# Role-aware configuration views

## Intent

MCP users should be able to ask about their GitGazer configuration ("list the GitHub apps", "which notification rule posts to a Slack channel?", "who are the admins?") with `run_sql`, without new tools. The answer must be what the GitGazer API shows the same person: the same rows, the same fields, the same role rules. Today the MCP can only read the mirrored GitHub data. The configuration lives in the `gitgazer` schema, which `gitgazer_mcp` cannot reach.

Later, the API should read through the same views, so that who-sees-what is defined once, in the database, and the MCP and the API cannot drift apart. This design builds the views for the MCP now and names and shapes them so the API can switch to them later. The switch itself is a separate project.

Builds on the signed tenant context (`docs/superpowers/specs/2026-10-28-mcp-signed-tenant-context-design.md`) and the "Role-aware access" section of `apps/docs/docs/technical/mcp-server.md`.

## Goals

- `run_sql`, `list_tables` and `describe_table` cover the configuration tables below, with no new tool.
- One view per table. No view joins columns from another table; callers join views themselves on `integration_id` plus the ids.
- Each view returns the rows the API would return to that user, and each column has a minimum role: below it the column is `NULL`, while the row stays visible (as the API returns `null`).
- Nothing in the views or the role function is MCP-specific, so `gitgazer_reader` can be granted them later.

## Non-goals

- Moving the API onto the views (later project, one domain at a time).
- Writing through the views.
- Fixing `GET /integrations/:id/invitations`, which returns full `users` rows (including `cognito_id`) for the inviter and invitee. Separate follow-up; the views do not copy it.
- The members' `slackLinked` flag, `ruleCount` per handle, and other values the API computes. Callers derive them with SQL.
- Cognito audience/scope for MCP tokens.

## Anti-goals

- Any grant for `gitgazer_mcp` on a `gitgazer` base table, or `USAGE` on the `gitgazer` schema. `run_sql` takes arbitrary SQL, so a grant on a base table is a grant on every column, including the secrets.
- A view that returns another tenant's rows, or a column to a role the API hides it from.
- Exposing secrets or identifiers the API never shows: the Slack bot token, Slack user ids of people, `cognito_id`, the MCP quota table, the signing key.

## The views (decided with the user)

All in schema `github`. "Rows for" is the minimum role in an integration to see its rows. A column not listed under "Column limits" is visible to everyone who sees the row; "never" means the column is not in the view.

| View                              | Base table                                 | Rows for  | Column limits                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integration_apps`                | `gitgazer.integration_apps`                | viewer+   | –                                                                                                                                                                                     |
| `integration_app_github_settings` | `gitgazer.integration_app_github_settings` | viewer+   | `secret`: admin+                                                                                                                                                                      |
| `integration_app_slack_settings`  | `gitgazer.integration_app_slack_settings`  | viewer+   | –                                                                                                                                                                                     |
| `notification_handles`            | `gitgazer.notification_handles`            | viewer+   | –                                                                                                                                                                                     |
| `webhook_handle_details`          | `gitgazer.webhook_handle_details`          | viewer+   | `url`: admin+                                                                                                                                                                         |
| `slack_handle_details`            | `gitgazer.slack_handle_details`            | viewer+   | –                                                                                                                                                                                     |
| `notification_rules`              | `gitgazer.notification_rules`              | viewer+   | –                                                                                                                                                                                     |
| `notification_rule_destinations`  | `gitgazer.notification_rule_destinations`  | viewer+   | –                                                                                                                                                                                     |
| `integration_invitations`         | `gitgazer.integration_invitations`         | member+   | `invite_token`, `email`: admin+                                                                                                                                                       |
| `event_log_entries`               | `gitgazer.event_log_entries`               | viewer+   | –                                                                                                                                                                                     |
| `user_assignments`                | `github."user-assignments"`                | viewer+   | –                                                                                                                                                                                     |
| `users`                           | `gitgazer.users` (global)                  | see below | only `id`, `email`, `name`, `picture`, `github_login`, `last_active_at`; `email`: only when the user is in an integration where the caller is admin+; `cognito_id`, `github_id` never |
| `slack_workspaces`                | `gitgazer.slack_workspaces` (global)       | see below | `installed_by`: only when that user is visible in the `users` view; `bot_token_ciphertext` never                                                                                      |

The role levels come from the routes: `GET /apps` and `GET …/members` require viewer; `GET …/invitations` requires member and shows `inviteToken` only to `hasRole(role, 'admin')`; `GET /apps` shows `secret` and `url` only to `hasRole(role, 'admin')`, which covers admin and owner; `GET /notifications` and `GET /event-log` return all of the caller's integrations. The column list of `users` is what `GET …/members` shows of them, except `email`: the user decided emails (members' and invitations') are for admin+ only, and both endpoints change to match (see "Also changes"). `slack_workspaces` goes beyond `GET /apps` with the user's approval: `bot_user_id` is the bot's own Slack id, not a person's, and `installed_at` is harmless. A workspace can be shared by several integrations, so `installed_by` may be a user of another tenant; it is `NULL` unless that user is visible in `users`.

`user_assignments` needs a name of its own, since a view cannot share its name with the `"user-assignments"` table in the same schema.

**Global tables.** `users` and `slack_workspaces` have no `integration_id`. Their views filter rows with a subquery over a tenant table, without taking columns from it: a user is visible when they have a row in `"user-assignments"` for one of the caller's integrations (viewer+); a workspace is visible when `integration_app_slack_settings` links it to one of the caller's integrations (viewer+).

## How (decided)

Every view uses the column-gate pattern from `apps/docs/docs/technical/mcp-server.md` ("Role-aware access"), including views without limited columns, so there is one pattern:

- A plain view owned by the migration user (who owns the base tables), **not** `security_invoker`. It runs as its owner, so base-table RLS does not apply and the view filters its own rows: `WHERE integration_id = ANY ((SELECT github.integration_ids('<minimum role>'))::uuid[])`.
- `security_barrier`, so a caller's predicate cannot run below that filter.
- A limited column is `CASE WHEN integration_id = ANY ((SELECT github.integration_ids('<role>'))::uuid[]) THEN <col> END AS <col>`.
- The role function is always called through a sub-select, so the context is verified once per view in a query, not once per row.
- `GRANT SELECT ON <view> TO gitgazer_mcp`; nothing else. Granting `gitgazer_reader` comes with the API switch.
- Views are defined in the Drizzle schema (the user wants everything Drizzle can express to live there). Grants go into a custom migration, as before.

**Generic names.** The signed context is no longer MCP-only, so its SQL names drop the `mcp_` prefix in this migration. Postgres policies reference functions by OID, so a rename keeps the existing policies working.

| Today                              | New                            |
| ---------------------------------- | ------------------------------ |
| `github.mcp_integration_ids(role)` | `github.integration_ids(role)` |
| `github.mcp_context()`             | `github.signed_context()`      |
| `gitgazer.mcp_sign_context(...)`   | `gitgazer.sign_context(...)`   |
| `gitgazer.mcp_context_key`         | `gitgazer.context_key`         |
| setting `rls.mcp_context`          | `rls.signed_context`           |

`packages/db/src/queries/readonlyQuery.ts` and the Drizzle schema follow the renames. The `gitgazer_mcp` role and `mcpTenantSeparationPolicy` keep their names: they really are the MCP's.

**Why views with `CASE`** (decided with the user). Postgres has row rules (RLS) and column rights per database role, but nothing that limits a column only in the rows where the caller is admin, and every MCP caller is the same database user. Ruled out: column grants alone (all or nothing for every caller), a database role or a view per app role (mixed roles across integrations lose rows or leak columns, and the client would have to pick), and moving the limited columns into side tables (data spread over several tables).

The views live in `github`, so `list_tables` and `describe_table` (which read `information_schema` for schema `github`) and the server instructions keep working.

## Also changes

- `GET /integrations/:id/members` returns `email: null` for callers below admin, and `GET /integrations/:id/invitations` does the same for the invitation `email`. The members page copes with a missing email.
- `run_sql`'s tool description names the new views among the readable tables. There is one view per table, never one per role: the view itself decides per integration which rows and columns the caller gets, so the client has nothing to choose.
- `apps/docs/docs/technical/mcp-server.md`: the table list, the "Not exposed" line, "No table uses a role gate yet", and the renamed functions.
- `.github/skills/db-migration/SKILL.md`: the view pattern and the renamed function.

## Testing

PGlite tests that load the real migration SQL (like `packages/db/src/queries/mcp-context.test.ts`), with prod-like roles: `root`, `gitgazer_reader`, `gitgazer_writer`, `gitgazer_mcp`. There is no `gitgazer_user`.

For each view, with a signed context holding integrations at different roles:

- only the right rows come back;
- limited columns are `NULL` below their role and set from it on;
- `integration_invitations` returns nothing for a viewer;
- `users` and `slack_workspaces` return only users and workspaces of the caller's integrations;
- `users.email` is `NULL` unless the user is in an integration where the caller is admin+;
- `slack_workspaces.installed_by` is `NULL` when the installer is not a member of any of the caller's integrations;
- no context returns nothing.

Also check:

- `gitgazer_mcp` has no privilege on any `gitgazer` table and no `USAGE` on that schema;
- every new view is `security_barrier` and not `security_invoker`;
- the existing MCP policies still work after the renames.

## Deployment

The migration runs by hand right before the deploy, as the migration user (the base-table owner), like the previous MCP migrations. Between the migration and the deploy, the old code calls `gitgazer.mcp_sign_context`, which no longer exists, so every MCP tool call fails with "Tool execution failed" and logs an error until the deploy finishes. That fails closed and is acceptable, since the product has few users. CI deploys on merge, so the migration runs before the merge reaches main. A rollback reverts both the code and the database (drop the views, rename the objects back, restore the old function bodies, delete the migration's row).

## Left to the builder

- Whether drizzle-kit's `pgView` can express `security_barrier` and these definitions cleanly. If it can't, put the views in the custom SQL migration and say why in the PR.
- Test structure and helpers.
