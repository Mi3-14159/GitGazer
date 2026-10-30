# Permission table for API routes and MCP tools

## Intent

GitGazer will get MCP tools that change resources: one tool per operation and resource (read, update,
delete). Today the minimum integration role is declared per route with `requireRole(...)`, so HTTP is
the only entry point that checks roles. A second entry point with its own checks would drift from the
first.

Before any write tool is built, role checks move to **one table** that both entry points use:

- a **router middleware** checks every API request against the table;
- a **tool wrapper** checks every MCP tool call against the same table.

This is a behaviour-preserving refactor of today's API. The write tools themselves come later and are
not part of this work.

## Goals

- One table maps every API route and every MCP tool to an operation, and every operation to the
  access it needs.
- Every API request and every MCP tool call is checked against that table on every request.
- Fail closed: a route or tool without a table entry is refused, at runtime and in CI.
- The API behaves exactly as today for every route and role (same status codes, same `authz` logs).

## Non-goals

- The MCP write tools, a `gitgazer-mcp/write` OAuth scope, and their audit entries (next project).
- Role enforcement for writes in the database (restrictive RLS policies). Possible later hardening.
- The web app's UI gating (`hasRole` in Vue components). It may read the table later; not now.
- Changing who may do what. Any difference from today's matrix is a bug in this work.

## Anti-goals

- A second place that decides minimum roles. After this work, `requireRole` no longer exists and no
  controller checks a minimum role.
- A new route or tool that works without someone deciding its access.

## Today

- `requireRole(minimumRole)` (`apps/lambdas/api/src/shared/middleware/require-role.ts`) runs per
  route after `addUserIntegrationsToCtx`, reads `integrationId` from the path, and answers `403`
  ("Not a member of this integration" / "Insufficient permissions"), logging `authz`.
- Routes without `integrationId` in the path have no role check; RLS limits them to the caller's
  integrations.
- `authenticate` runs for the whole app before `/api` is routed (`app.use(authenticate)` in
  `apps/lambdas/api/src/app.ts`) and skips public routes by matching the raw path against the
  `publicPrefixes` collected in `apps/lambdas/api/src/shared/middleware/public-routes.ts`.
  `/.well-known/oauth-*` and `/fe-failover/*` are mounted at `/`, outside `/api`.
- The Slack install callback (`/api/slack/oauth/callback`) checks admin inside
  `completeSlackInstall` (`apps/lambdas/api/src/domains/apps/slack-install.ts`), because its
  integration comes from the signed OAuth `state`, not the path. A non-admin is logged with
  `logger.warn` and redirected to the web app with a "failed" result, like any other install
  failure; it never gets a 403.
- The current matrix is documented in `apps/docs/docs/technical/roles-and-permissions.md`
  (Permission matrix) and must be reproduced exactly.
- MCP tools are registered through one wrapper, `registerTool` in
  `apps/lambdas/api/src/domains/mcp/mcp.tools.ts`, which already resolves the caller's
  `integrationRoles`. The three tools (`run_sql`, `list_tables`, `describe_table`) are read-only;
  role-dependent visibility for `run_sql` is enforced in the database by the role-aware views.
- Controllers keep rules a minimum role can't express (only an owner may change an admin, nobody
  changes their own role, an owner can't leave, …). Those stay where they are.

## Design (decided)

### The table

Each operation has an access level:

| Level           | Meaning                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| `public`        | No authentication (today's `publicPrefixes`: auth, webhooks, GitHub App, MCP OAuth, …).       |
| `signedIn`      | Any signed-in user (e.g. accept an invitation, `/api/user`, ws token, create an integration). |
| `anyMembership` | Signed in; acts on all the caller's integrations, scoped by RLS (workflows, event log, …).    |
| a `MemberRole`  | At least this role in the operation's integration (`viewer` … `owner`).                       |

Routes map to operations by method and route pattern, e.g.
`DELETE /api/integrations/:integrationId` → `integration.delete` → `owner`. MCP tools map by tool name,
e.g. `run_sql` → `mcp.runSql` → `anyMembership`.

Every route of the api app (under `/api` and the ones mounted at `/`) and every MCP tool has exactly
one entry. The table is plain typed data
(no logic), so a reviewer can read the whole access model in one file.

### The check

One function, `authorize(caller, operation, integrationId?)`, compares the caller's role (from
`integrationRoles`, ranked with `ROLE_RANK`/`hasRole`) with the operation's level, logs the decision
with today's `authz` fields (`userId`, `integrationId`, `role`, `minimumRole`, `action`, `allowed`,
`reason`) and returns it. The middleware and the tool wrapper turn a refusal into their response;
the middleware's are today's `403 Not a member of this integration` and `403 Insufficient
permissions`.

### API: router middleware

One middleware (not one per route) finds the operation for the matched route, then calls
`authorize`. It is mounted on the app right after `authenticate`, so it also sees the routes mounted
at `/`. For a role level it uses the matched route's `:integrationId`. It loads the caller's roles
itself, only when the operation needs them, and still sets `appContext.role` for the controllers.
Routes no longer declare `requireRole`. Unknown paths keep answering `404`.

**Authentication stays where it is (my call).** `authenticate` keeps deciding which requests skip
authentication through `publicPrefixes`, so authentication behaves exactly as today. To keep the two
from disagreeing, the CI completeness test also checks that every route matched by a public prefix
has the `public` level in the table, and every `public` entry is matched by a prefix. Moving the
authentication decision into the table would mean resolving the route before routing, a bigger
change for no gain in this refactor.

**The Slack install callback keeps its redirect (my call, from the "behaves exactly as today"
goal).** Its table entry has the `admin` level and is marked as checked by its handler, so the
middleware lets it through without a `:integrationId` in the path. After decoding the signed state,
the callback calls `authorize(caller, 'slackApp.installCallback', integrationIdFromState)` and, on a
refusal, redirects with the "failed" result as today. The `logger.warn` becomes the `authz` log entry
that `authorize` writes. Whether the call sits in the route handler or stays in
`completeSlackInstall` is the builder's choice.

`anyMembership` never refuses a caller with no integrations; they get empty results, as today.

### MCP: tool wrapper

`registerTool` takes the operation for the tool and calls `authorize` on every call, before the tool
runs. A tool can't be registered without an operation (enforced by the type). A refused call returns
an in-band tool error like other tool failures, and is logged as `authz`. For future write tools,
the integration comes from a tool argument (`integration_id`); the wrapper reads it from there.

`run_sql`'s role-dependent visibility stays in the database (signed context and role-aware views).

### Fail closed

- Runtime: the middleware refuses a route without an entry (`403`, logged as `authz` with reason
  "no permission entry"); the wrapper refuses an unknown tool the same way.
- CI: a test walks every registered route of the api app and every registered MCP tool and fails if
  one lacks an entry, if an entry matches no route or tool, or if the `public` entries and
  `publicPrefixes` disagree.

### Roll-out

One PR: table, `authorize`, middleware, tool wrapper, removal of `requireRole`, tests. The table is
about fifty entries and the change is mechanical; a staged roll-out would mean running both checks
side by side. (My call.)

### Tests

- A table-driven test over every role-protected operation: each role below the minimum gets `403`,
  the minimum gets through. This replaces the per-route `requireRole` tests and the route tests that
  pin roles (e.g. `DELETE /api/integrations/:integrationId` for admin, member, viewer).
- The CI completeness test above.
- MCP: an unknown tool is refused; a tool call is checked on every call, not once per session.

### Docs

`roles-and-permissions.md` and `authentication.md` describe the table, the middleware and the tool
wrapper instead of `requireRole`; the permission matrix points at the table file as the source.

## Left to the builder

- Where the files live (my suggestion: `apps/lambdas/api/src/shared/permissions/`).
- Operation names, as long as they read `resource.action`.
- How the middleware gets the matched route pattern and its `:integrationId` in Hono 4.13: the
  `matchedRoutes`/`routePath` helpers from `hono/route` give the pattern, but path params seen by a
  router-level middleware may not include the final route's params. Verify, and if needed read the
  param from the matched route's match result or mount the middleware so it sees the params.
- How the completeness test enumerates routes (Hono's `app.routes`) and tools.
