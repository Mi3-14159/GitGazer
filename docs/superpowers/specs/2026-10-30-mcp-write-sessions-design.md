# MCP write sessions and notification-rule tools

## Why

The MCP server is read-only today (`run_sql`, `list_tables`, `describe_table`). We want agents to
change GitGazer configuration, starting with notification rules. Like other products with MCP
servers, the user decides at connect time whether a client gets a **read-only** or a **read & write**
session, and a client only sees the tools its session allows.

The permission table (PR #1923) already checks every tool call against the caller's integration role;
this project adds the second, independent dimension: what the user allowed this client to do.

## Goals

- At MCP connect, the user chooses "Read only" (preselected) or "Read & write" on a GitGazer screen.
- The choice is carried in the access token as an OAuth scope and lasts for the connection
  (refreshes keep it).
- `tools/list` shows write tools only in a write session; a read-only session cannot call them.
- Three write tools: create, update and delete a notification rule.

## Non-goals

- Write tools for other resources (apps, members, integrations). Later projects reuse the mechanism.
- Hiding write tools from callers whose role can't use them (e.g. a viewer everywhere). The per-call
  role check answers with "Insufficient permissions"; filtering by role is a later refinement.
- Tools for notification handles (destinations). Handles are created through apps; the agent reads
  existing handle ids via `run_sql`.
- Upgrading an existing connection in place. Existing tokens stay read-only; to get write access the
  user reconnects and picks "Read & write".

## Anti-goals

- A client must not be able to obtain a write session without the user choosing it on the screen
  (e.g. by adding a query parameter, or by sending the browser straight to a URL past the screen).
- A read-only session must not be able to call a write tool by name.
- No role check inside controllers or tool bodies: tool authorization stays in the permission table
  via `checkAccess` (see `apps/lambdas/api/src/shared/permissions/`).

## Decided design

### Connect flow

1. The MCP client opens `GET /api/mcp/oauth/authorize?…` (unchanged validation: `response_type`,
   allowlisted `redirect_uri`, PKCE S256). Instead of redirecting to Cognito, the proxy redirects to
   the web app page **`/mcp/connect`** with a signed, short-lived copy of the validated request
   (same HMAC/`stateSecret` scheme as the existing proxy state).
2. `/mcp/connect` (Vue, styled like `Login.vue`: centered, logo, max-w-sm) shows layout **A**:
   - Title "Connect an MCP client", subtitle "Choose what this client may do".
   - Option card **Read only** (preselected): "Query workflows, PRs and configuration";
     lists `run_sql`, `list_tables`, `describe_table`.
   - Option card **Read & write**: "Everything above, plus change notification rules";
     lists "create / update / delete notification rules" and "needs the member role in that integration".
   - One button whose label follows the selected option: **"Allow read access"** or
     **"Allow read & write access"**. It names the grant, not the login, because with a live Cognito
     session the user comes straight back without seeing GitHub.
3. The button submits a **POST** (form post, so the browser navigates) to a new API endpoint, e.g.
   `POST /api/mcp/oauth/authorize`, with the signed request and the chosen session type. The endpoint
   verifies the signature, expiry and purpose of the signed request, then redirects (303) to Cognito
   as `handleAuthorize` does today, adding `gitgazer-mcp/write` to the scopes for a write session.
   The response also sets the **binding cookie** (below).
4. The callback additionally checks the binding cookie before relaying the code. The token endpoint
   is unchanged.

#### Binding the choice to the user's browser (my call)

`Origin` checks alone don't stop a client from skipping the screen: a client can send the POST from
its own HTTP stack with any `Origin`, or reuse a signed state in a hand-built Cognito URL, and then
open the resulting Cognito URL in the user's browser. Cognito has no consent screen of its own, so
the proxy must make sure the code is only relayed when **this browser** went through our screen:

- The POST generates a random nonce, puts it in the signed Cognito `state` together with the
  approved session type, and sets it as a cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, path
  `/api/mcp/oauth`, max-age = the state TTL (600 s).
- `/api/mcp/oauth/callback` rejects the request unless the cookie is present and equal to the nonce
  in the state (constant-time compare), then clears the cookie (one use). `SameSite=Lax` cookies are
  sent on the top-level redirect back from Cognito.
- A client that scripted the POST has the cookie in its own HTTP client, not in the user's browser,
  so the callback fails. A client that hand-builds a Cognito URL never sees a state minted in the
  user's browser.
- Signed blobs carry a **purpose** field (`connect-request` for the GET→screen hand-off,
  `cognito-state` for the Cognito `state`), and each verifier accepts only its own purpose, so one
  can't be replayed as the other.
- The POST rejects requests whose `Origin` is missing, `null`, or not in `allowedFrontendOrigins`
  (strict; the generic `originCheck` middleware skips `/api/mcp` and lets a missing `Origin`
  through, so the endpoint checks itself). This check is **load-bearing**, not hygiene: without it a
  client could keep the connect-request from the GET redirect and get the user to visit a page that
  form-posts it with "write" — the cookie would then land in the user's own browser, and with an
  existing Cognito session the flow completes without any prompt. The cookie stops scripted POSTs;
  the strict `Origin` check stops cross-site form posts. Both are required.
- Infra check (done): the SPA and `/api/*` are served by the same CloudFront distribution
  (`infra/cloudfront.tf`), and `/api/*` uses caching disabled with the `AllViewerExceptHostHeader`
  origin request policy, so cookies reach the function and `Set-Cookie` on the 303 reaches the
  browser.

#### Scope lists

Today `handleAuthorize` keeps any requested scope in `SUPPORTED_SCOPES` and grants all of them when
none is requested. Split this into two lists:

- **advertised** scopes (metadata `scopes_supported`): `openid email profile gitgazer-mcp/read
  gitgazer-mcp/write`;
- scopes **requestable by clients** (the clamp on the client's `scope` parameter and the default when it
  sends none): `openid email profile gitgazer-mcp/read`.

`gitgazer-mcp/write` is added only by the POST, only when the user picked "Read & write".

### Scopes and infra

- Cognito resource server `gitgazer-mcp` (`infra/cognito.tf`) gets a second scope `write`
  ("Change GitGazer configuration through the MCP server"); the MCP app client's
  `allowed_oauth_scopes` includes it. The web client does not.
- `apps/lambdas/api/src/shared/mcp-scope.ts` gains `MCP_WRITE_SCOPE = 'gitgazer-mcp/write'`.
- Every MCP token still needs `gitgazer-mcp/read` (the screen always requests it).
- The AS and protected-resource metadata list `gitgazer-mcp/write` in `scopes_supported`.

### Tool selection per session

- The MCP route already verifies the bearer token before handing the request to the SDK. It decides
  the session type from `auth.scopes` and builds the server with the matching tool set
  (e.g. `createMcpServer({write: boolean})`, with one prebuilt `createMcpHandler` per session type).
  Unregistered tools are absent from `tools/list` and fail as unknown tools.
- Both the modern and legacy paths in `mcp.routes.ts` use the same selection.
- The `TOOLS` map in the permission table gets entries for the new tools; the table tests that every
  registered tool has an entry keep passing.
- The new `POST /api/mcp/oauth/authorize` gets a `ROUTES` entry with a public operation (the GET
  keeps `mcp.oauthAuthorize`; the POST can share it or get its own, e.g. `mcp.oauthAuthorizeConfirm`).

### Write tools

All three go through the existing `registerTool` wrapper (caller resolution, `checkAccess` on every
call, in-band errors), which needs to accept tool annotations instead of hard-coding
`readOnlyHint: true`.

| Tool | Permission-table operation | Annotations |
|---|---|---|
| `create_notification_rule` | `notificationRule.create` (member) | `readOnlyHint: false` |
| `update_notification_rule` | `notificationRule.update` (member) | `readOnlyHint: false` |
| `delete_notification_rule` | `notificationRule.delete` (member) | `readOnlyHint: false`, `destructiveHint: true` |

- Every write tool's input schema **requires** `integration_id` (string), so `checkAccess` always
  gets it.
- `create_notification_rule`: `integration_id`, `label`, `handle_ids`, `enabled`,
  `ignore_dependabot`, optional `include_log_details`, `rule` (`owner`, `repository_name`,
  `workflow_name`, `head_branch`, `topics`, all optional). Validation mirrors
  `isNotificationRuleUpdate` (label 1–100 chars, ≤ 20 handle UUIDs, ≤ 50 topics of ≤ 100 chars).
  Calls `upsertNotificationRule({…, createOnly: true})`. Returns the saved rule.
- `update_notification_rule`: `integration_id`, `rule_id`, and any subset of the create fields.
  **Partial**: loads the stored rule, merges the given fields (a given `rule` object replaces the
  stored filter object as a whole), then calls `upsertNotificationRule` with the `ruleId`. A rule id
  that doesn't exist in that integration returns "Notification rule not found" and must **not**
  create a rule (the REST `PUT` upserts; the tool must not).
- `delete_notification_rule`: `integration_id`, `rule_id`. Unknown id returns
  "Notification rule not found".
- Writes reuse the controller functions, so the existing event-log entries are written. Entries
  created through MCP say so (e.g. "… was updated via MCP"); the REST path's wording is unchanged.
  This needs small controller changes (my call, builder picks the shape):
  - a way to pass the source ("via MCP") into `upsertNotificationRule` / `deleteNotificationRule`;
  - a single-rule load for the update merge, in the same RLS transaction as the write where
    practical, so a rule deleted in between is reported as not found instead of being recreated
    by the upsert;
  - `deleteNotificationRule` reports whether a row was deleted, and writes the "deleted" event-log
    entry only when one was (this also fixes the REST path logging deletes of unknown ids).
- Known errors (unknown handle, not found, validation) are returned as in-band tool errors with
  their message; other errors stay generic, as today.
- The server `INSTRUCTIONS` and the write tools' descriptions tell the agent to look up rule and
  handle ids with `run_sql` on `gitgazer.notification_rules_view`,
  `gitgazer.notification_rule_destinations_view` and `gitgazer.notification_handles_view`.

### Docs

- `apps/docs/docs/technical/mcp-server.md`, `authentication.md`, `roles-and-permissions.md`:
  session types, the write scope, the connect screen, the new tools.
- `apps/docs/docs/user-guide/ai-assistants.md`: how to choose read & write when connecting, and that
  existing connections need to reconnect.

## Left to the builder

- Exact names of the signed-request parameter and the POST endpoint, and how the web page gets the
  values (query string is fine; the payload carries no secrets).
- Whether `/mcp/connect` lives inside or outside the authenticated app layout (it must work for a
  logged-out user, like `/login` and `/invite/:token`).
- How tool sets are split in code, as long as each tool is registered in one place.
- The local-dev fallback for the web page URL (the MCP origin is the web app's origin in deployed
  environments; locally the strict `allowedFrontendOrigins` check covers the Vite dev origin).
