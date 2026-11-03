# MCP write tools: parity with the API

## Why

PR #1927 gave MCP clients a read-only or read & write session and three notification-rule write
tools. The user wants the MCP server to reach "feature parity" with the API, **but only where it
makes sense**: actions that are dangerous, irreversible, change who has access, or need a browser
round trip stay in the web app.

## Goals

- A read & write session can do every API write that is safe for an agent: rename an integration,
  manage notification handles (Slack and webhook), choose the GitHub app's webhook events, and mark
  event-log entries read.
- Every API write operation is explicitly classified as either "has an MCP tool" or "never in MCP,
  because …", and a test fails when a new operation is neither. New endpoints force a decision.
- Handle changes are audited in the event log (web app and MCP), because a webhook URL decides where
  workflow data is sent.

## Non-goals

- New mechanism: session types, the connect screen, scopes and the per-call permission check from
  PR #1927 are reused unchanged.
- New read tools beyond `list_slack_channels`. All other reads go through `run_sql` on the
  configuration views.
- Hiding tools by role (still a later refinement; the per-call check answers "Insufficient
  permissions").

## Anti-goals

- No MCP tool for any operation on the exclusion list below, not even behind an extra flag.
- No role checks in tool bodies or controllers; authorization stays in the permission table via
  `checkAccess` (`apps/lambdas/api/src/shared/permissions/`).
- Two copies of business logic. Where the REST route holds logic inline (e.g. webhook events,
  rename), it moves into a controller function that both the route and the tool call.

## Decided design

### New tools

All write tools are registered only in write sessions (same `registerMcpTools(server, {write})`
switch as the notification-rule tools), go through the existing `registerTool` wrapper, and get a
`TOOLS` entry mapping to the existing operation. Every tool that maps to an integration-scoped
operation requires `integration_id`.

| Tool | Operation | Role | Session | Annotations |
|---|---|---|---|---|
| `rename_integration` | `integration.rename` | admin | write | `readOnlyHint: false` |
| `create_notification_handle` | `handle.create` | admin | write | `readOnlyHint: false` |
| `update_notification_handle` | `handle.update` | admin | write | `readOnlyHint: false` |
| `delete_notification_handle` | `handle.delete` | admin | write | `destructiveHint: true` |
| `update_webhook_events` | `githubApp.updateEvents` | admin | write | `readOnlyHint: false` |
| `set_event_log_read` | `eventLog.markRead` | authenticated | write | `readOnlyHint: false` |
| `mark_all_event_log_read` | `eventLog.markAllRead` | authenticated | write | `readOnlyHint: false` |
| `list_slack_channels` | `slackApp.channels` | admin | **both** | `readOnlyHint: true` |

Inputs mirror the REST endpoints:

- `rename_integration`: `integration_id`, `label` (same validation as `PUT /api/integrations/:id`).
- `create_notification_handle`: `integration_id`, `app_id`, and either `channel_id` (Slack app) or
  `name` + `url` (Webhook app). Exactly one shape; anything else is an in-band error. Calls
  `createHandle`, so the app-type check, handle limits and `assertWebhookUrl` apply unchanged. The
  app must already be installed; the tool never installs one.
- `update_notification_handle`: `integration_id`, `handle_id`, optional `name`, optional `url`
  (calls `updateHandle`; "Nothing to update" and "Only Webhook handles have a URL" come back in-band).
- `delete_notification_handle`: `integration_id`, `handle_id` (calls `deleteHandle`; unknown id →
  "Handle not found"). Description warns that rules lose this destination.
- `update_webhook_events`: `integration_id`, `installation_id` (number), `events` (subset of
  `GITHUB_APP_WEBHOOK_EVENTS`). Same success/failure event-log entries as the route. The route's
  logic moves into a shared controller function, which also fixes a tenant-scoping bug (below).
- `set_event_log_read`: `id` (uuid), `read` (boolean). No `integration_id`: the operation is
  `authenticated` and RLS scopes it to the caller's integrations, as in the REST route.
- `mark_all_event_log_read`: no input; marks all unread entries in the caller's integrations, as the
  REST route does. Returns the count.
- `list_slack_channels`: `integration_id`, `app_id`. Read-only, so it is available in both session
  types; needed because Slack channels are not visible through `run_sql`.

`INSTRUCTIONS` and tool descriptions tell the agent where ids come from:
`gitgazer.integration_apps_view` (app ids and types), `gitgazer.notification_handles_view`,
`gitgazer.webhook_handle_details_view`, `gitgazer.slack_handle_details_view`,
`gitgazer.event_log_entries_view`, and `github.github_app_installations` (newly readable, below).
The write-session sentence lists the new capabilities.

### Caller scope for tools (my call)

Integration-scoped tools pass `integrationIds: [integration_id]`, as the notification-rule tools do.
The two event-log tools (operation `authenticated`, no `integration_id`) pass every integration the
caller belongs to (`Object.keys(caller.integrationRoles)`), which is what `addUserIntegrationsToCtx`
gives the REST route; a viewer can mark entries read on REST today and can via MCP.

`list_slack_channels` gets no extra quota: it is admin-only and Slack's own rate limits apply, as in
the web app.

### Installation id visibility (decided with the user)

`github.github_app_installations` was never granted to `gitgazer_mcp` (the role's grants are an
explicit list of data tables), so the agent cannot find `installation_id`. The table has no secret or
role-dependent columns and every member sees installations in the web app, so it gets the same
treatment as the other GitHub data tables instead of a view: `mcpTenantSeparationPolicy()` on the
table in the Drizzle schema plus `GRANT SELECT ON TABLE github.github_app_installations TO
gitgazer_mcp` in the migration (generated offline with `drizzle-kit generate`, grant hand-added). The
migration must be applied before the API change is deployed.

### Webhook-events tenant scoping (done in #1928)

The REST route now rejects an installation that is not linked to the integration with 404
"Installation not found" before any GitHub call or event-log entry, and `updateAllWebhookEvents`
writes `github_app_installations` in the writer RLS transaction scoped to the integration. The
check moves with the route logic into the shared controller, so the MCP tool gets it too.

### Exclusion list

`apps/lambdas/api/src/shared/permissions/table.ts` gets an explicit map of operations that never get
an MCP tool, each with its reason (a short string). A test asserts that **every non-`public`
operation** is in exactly one of `TOOLS` (values) or the exclusion map (my call: classifying all of
them catches state-changing GETs such as OAuth callbacks, and needs no heuristic). Reads served by
`run_sql` go in the map with a reason like "read through run_sql"; session plumbing (`auth.logout`,
`auth.wsToken`, `user.get`) and browser callbacks (`slackApp.installCallback`,
`slackUser.signInCallback`, `invitation.accept`) likewise. The table below lists the write
operations that are excluded on purpose.

| Operation | Reason |
|---|---|
| `integration.create` | creates an integration and installs its GitHub app; setup happens in the UI |
| `integration.delete` | irreversible, deletes all integration data |
| `githubApp.rotateSecret` | security-sensitive, breaks webhook delivery until GitHub is updated |
| `githubApp.linkInstallation` | needs GitHub's install flow in the browser |
| `githubApp.unlinkInstallation` | stops data ingest; re-linking needs the browser |
| `githubApp.updateOrgSync` | sets the role every synced org member gets (can be admin); people management |
| `member.changeRole`, `member.remove` | people management stays in the UI |
| `member.leave` | irreversible for the caller |
| `invitation.create`, `invitation.resend`, `invitation.revoke` | people management stays in the UI |
| `app.install`, `app.remove` | app installation is always a manual step in the UI |
| `slackApp.install`, `slackApp.move` | Slack OAuth / admin migration in the browser |
| `slackUser.connect`, `slackUser.disconnect` | personal Slack sign-in in the browser |

The builder decides which plumbing operations (auth, MCP OAuth, webhooks, `invitation.accept`,
OAuth callbacks) the test ignores and how; the point is that a new user-facing write operation can't
slip through unclassified.

### Handle audit entries

`createHandle`, `updateHandle` and `deleteHandle` write event-log entries (category and wording in
the style of the notification-rule entries), for both the REST and MCP paths:

- created: handle name, type, and for webhooks the URL's host;
- updated: what changed, including old and new URL host when the URL changes;
- deleted: the handle name (load it before deleting).

Only the host of a webhook URL is logged, never the full URL: webhook URLs carry secrets (e.g. Slack
incoming-webhook tokens), `webhook_handle_details_view` shows them to admins only, and event-log
entries are visible to viewers (my call).

They take the same optional `ChangeSource` as the notification-rule controller; `'mcp'` appends
" via MCP". The REST wording has no suffix. A failed write logs nothing. Audit writes run after the
transaction commits and are best-effort (caught and logged), exactly like `logRuleChange` (my call:
a failed audit write must not report a committed change as failed).

The rename path (`upsertIntegration`) already writes "Integration renamed"; it gains the same
optional `ChangeSource`. The webhook-events entries gain it too.

### Errors

As today: `HttpError` < 500 (not found, validation, conflict, limits) comes back in-band with its
message; anything else stays generic.

### Docs

`apps/docs/docs/technical/mcp-server.md` (tool list, exclusion rationale),
`apps/docs/docs/technical/roles-and-permissions.md` (TOOLS + exclusion list),
`apps/docs/docs/user-guide/ai-assistants.md` (what a read & write session can and can't do).

## Left to the builder

- File split: e.g. `mcp.integration-tools.ts`, `mcp.handle-tools.ts`, `mcp.event-log-tools.ts`, or
  fewer files; each tool registered in one place.
- Exact event-log titles/categories for handle and rename entries.
- The reason strings for the read/plumbing entries in the exclusion map.
- Error status for renaming an unknown integration (today `upsertIntegration` throws
  `UnauthorizedError`; anything < 500 comes back in-band).
