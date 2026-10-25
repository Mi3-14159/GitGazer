# Slack app — design

## Why

Slack delivery today runs through the Webhook app: someone creates an incoming webhook in Slack, copies its URL and
pastes it into GitGazer as a handle. Alerts can name the person behind a failed job only as a GitHub login, because a
webhook cannot look anyone up, so nobody feels addressed. The integration apps system
([2026-10-25-integration-apps-design.md](2026-10-25-integration-apps-design.md)) was built as groundwork for a real
Slack app. This design adds it:

1. **Sending without setup.** An admin installs the GitGazer Slack app once; alerts are then posted by the app into
   channels picked in GitGazer. No webhook URLs.
2. **Knowing who is who.** The installed app can look Slack users up, so GitGazer links GitHub accounts to Slack users
   and alerts mention the right person.

This supersedes the parked design on local branch `slack-mentions/design` (typed Slack member IDs), which is not built.

## Goals

- A new app type `slack` in the apps catalog (today shown as "coming later"), installable through Slack's standard
  "Add to Slack" OAuth flow.
- Its notification handles are Slack channels; rules point at them like at Webhook handles.
- Every alert sent through the Slack app mentions the person it already names in its "by …" line, whenever that GitHub
  account is linked to a Slack user.
- Links are made automatically from exact email matches; anyone not found can link themselves with a "Connect Slack"
  link.
- After installing, GitGazer offers to move the integration's Webhook handles for the same workspace over to channels.

## Non-goals

- No direct messages; alerts go only to the channels rules point at.
- No interactive buttons, slash commands or Events API: Slack never calls GitGazer except the OAuth redirects. Alert
  buttons stay plain links.
- No change to alert content beyond the mention; `buildSlackAlert` keeps its layout.
- No mentions in alerts sent through the Webhook app; it stays as it is for teams that don't install the Slack app.
- No more than one Slack workspace per integration (the existing one-app-per-type rule).
- Deleting the old incoming webhooks in Slack: Slack offers no API for one app to revoke another app's webhook (see
  "Moving Webhook handles").

## Anti-goals

- **Pinging the wrong person.** Links come only from exact email matches or from the person signing in with Slack.
  Never from names, display names or fuzzy matches. A missed ping is acceptable; a wrong one is not.
- **Leaking the bot token.** It can read the workspace's user emails. It is never returned by the API, never logged,
  never readable by the MCP role, and stored encrypted.
- **Untrusted text producing a mention.** Only a Slack user ID that came from the link table, checked by shape (`U` or
  `W` followed by uppercase letters and digits), becomes `<@…>`, added after escaping. Job names, branches, log lines
  and AI summaries keep being escaped and neutralised as today.
- Breaking existing Webhook delivery before or during a move.

## Decided with the product owner

- The Slack app sends the messages (no webhooks to set up) and maps Slack users to GitHub accounts.
- Everyone who can be mapped automatically is linked and pinged, not only GitGazer users.
- Automatic links from exact email matches only (sources below); no name matching. Fallback: a "Connect Slack" link
  (Sign in with Slack).
- The person mentioned is the one the alert already shows (the job's `sender`), on every alert from the Slack app when
  linked. Rules decide whether an alert is sent; mentions add no filtering and have no per-rule switch.
- No direct messages.
- After installing, GitGazer offers to move Webhook rules over to Slack channels and asks the admin to remove the old
  webhooks in Slack (GitGazer cannot delete them itself).
- The Webhook app stays available.

## Slack app registration

The product owner registers one GitGazer Slack app in Slack's developer console, distributable to other workspaces. Its
client ID, client secret and signing details live in the config secret like the other credentials (never in the repo).
The builder writes the app manifest into the repo so the registration is reproducible; it must not contain secrets or
personal details.

Bot scopes (builder confirms against Slack's docs): `chat:write`, `chat:write.public` (post to public channels without
joining), `channels:read` and `groups:read` (list channels), `users:read` and `users:read.email` (email lookup). Sign in
with Slack uses the OpenID Connect scopes (`openid`, `profile`, `email` as needed) on the same app.

All Slack API calls go to `slack.com`, already allowed by `http-proxy`, so the worker and API reach Slack through
`proxyFetch` as they reach GitHub today. No new egress.

## Installing and removing

- **Install:** admins and owners click "Install" on the Slack card in the Apps tab. GitGazer redirects to Slack's OAuth
  authorize page with a `state` bound to the user's session and the integration (CSRF protection; single use, short
  lived). The OAuth redirect lands on a new API route, which exchanges the code, then stores the app: workspace (team)
  ID and name, bot user ID, bot token (encrypted), who installed it and when. Then the user returns to the Apps tab.
- **Reinstall into another workspace:** not allowed while a Slack app is installed; remove it first.
- **Remove in GitGazer:** revokes the bot token in Slack (`auth.revoke`), then deletes the app. Its handles, their rule
  destinations and its links go with it (cascade), like removing the Webhook app.
- **Removed or revoked in Slack:** GitGazer has no Events API, so it notices on the next call that fails with a
  revoked/invalid-auth error. It marks the app as disconnected, stops using it, and the Slack card shows "Disconnected —
  reinstall". Reinstalling into the same workspace reconnects it and keeps its handles and links. Moving to a different
  workspace requires removing the app first.

## Handles: channels

- `slack_handle_details` (1:1 with a handle of a Slack app, like `webhook_handle_details`): `channel_id`, plus the
  channel name as last seen (for display only).
- Admins add a handle by picking a channel from a list GitGazer loads from Slack (`conversations.list`, public and
  private channels the app can see). The handle name defaults to `#channel-name` and can be changed.
- Public channels work immediately (`chat:write.public`). A private channel appears only after someone runs
  `/invite @GitGazer` in it; the picker says so.
- If posting fails because the channel was archived or the app was removed from it, the failure is logged like a
  failing webhook today; the handle stays. Showing such errors on the handle is the builder's call.

## Sending

- Delivery for Slack handles uses `chat.postMessage` with the bot token, `channel` = the handle's channel ID, and the
  same blocks/attachments `buildSlackAlert` produces today. Webhook handles keep posting their URL.
- Grouping stays as in the apps design: one message per handle per failed job, log details included if any matching
  rule has them on.
- A Slack API error is logged with the job and handle IDs, never the token; one handle failing doesn't stop the others
  (as today).

## Linking GitHub accounts to Slack users

### Storage

A link table per Slack app installation (tenant-scoped like everything else): GitHub user ID → Slack user ID, plus
`source` and `checked_at`. Sources, defined once as an `as const` tuple:

- `gitgazer_email` — email of a GitGazer user (from login), whose `users.githubId` is the GitHub account.
- `github_profile_email` — the GitHub account's public profile email.
- `commit_email` — the head commit's author email, used only when that commit's author is known to be the same GitHub
  account.
- `slack_sign_in` — the person connected themselves through Sign in with Slack.

A "not found" result is also stored (no Slack user, `checked_at` set) so the next alert doesn't ask Slack again.
Automatic lookups never overwrite a `slack_sign_in` link.

### Automatic lookup

For a GitHub account, try the sources in this order and stop at the first email that Slack's `users.lookupByEmail`
resolves in the installed workspace:

1. The email of the GitGazer user with that `githubId`, if any.
2. The public email from `GET /users/{login}`, read with a GitHub App installation token. Integrations without a GitHub
   App installation (manual webhook only) skip this source.
3. The head commit's author email from the run, only if it is not a `users.noreply.github.com` address and the commit's
   author is that same GitHub account. GitGazer doesn't store commit emails today (only `head_commit_author_name`); if
   the builder can't establish the author's GitHub account reliably from what GitHub sends, this source is dropped.

Deactivated Slack users and bots don't count as matches.

When lookups run (Claude's call):

- At send time, for the person on the alert, if there is no link or the stored result is older than its refresh
  interval: a found link is rechecked after 7 days, a "not found" after 24 hours. A lookup that fails (timeout, rate
  limit) doesn't block the alert; it goes out without a mention and is retried on a later alert.
- Right after install, for the integration's members.
- When a member signs in to GitGazer, for that member.

Rate limits: lookups are few (one person per alert at most, cached), within `users.lookupByEmail`'s tier. The builder
handles Slack's `429` with `Retry-After` by skipping the mention, not by waiting.

### "Connect Slack" link

For people the automatic lookup misses (their Slack email differs):

- **Where:** a "Connect Slack" button for the signed-in user on the integration's Members page (their own row) and on
  the Slack app's settings. Copy explains it's for when the automatic match failed.
- **Flow:** Sign in with Slack (OpenID Connect) on the GitGazer Slack app, with `state` bound to the user's session and
  integration. On return, GitGazer checks that the Slack workspace is the integration's installed workspace and links
  the user's GitHub account (from their GitGazer login) to the returned Slack user ID with source `slack_sign_in`.
- **Disconnect:** the same place offers "Disconnect". It removes the link and keeps a marker so automatic lookup does
  not link that GitHub account again until the person connects again.
- Only the person themselves can connect or disconnect; admins can't link others.

### Visibility

Members see whether a member is linked (a Slack badge on the Members page), not the Slack ID. Admins see the same.
Links are not granted to the MCP role.

## Mentions in alerts

Taken over from the parked design, applied only to Slack-app handles:

- The worker resolves the sender's link once per alert, alongside the verdict and pull request lookups.
- With a link, the "by …" context line shows `<@U…>` instead of the escaped GitHub login, and the top-level fallback
  `text` carries the mention too, so the push notification shows it. The existing neutralisation of bare
  `@here`/`@channel`/`@everyone` stays.
- `verbatim: true` on text objects stays; explicit `<@U…>` still renders.
- The alert's event-log entry records whether a mention was included (boolean only, never the Slack ID).

## Moving Webhook handles

Offered right after install (and from the Webhook app's settings while both apps exist), to admins and owners:

1. GitGazer lists the integration's Webhook handles whose URL points to the installed workspace (the `T…` segment of
   `hooks.slack.com/services/T…/…` matches the installed team ID). Handles for other workspaces are not offered.
2. A webhook URL doesn't reveal its channel, so the admin picks the target channel for each listed handle, shown by its
   name. Handles can be skipped.
3. On confirm, for each picked handle: create the channel handle, repoint every rule destination from the Webhook
   handle to it, delete the Webhook handle. In one transaction per handle, so a failure leaves that handle untouched.
   If the Webhook app has no handles left, offer to remove it.
4. GitGazer ends with a checklist of the webhooks to remove in Slack (by handle name and channel) and a link to the
   workspace's app management page. Until someone removes them there, the old URLs still work, but GitGazer no longer
   uses them.

## UI

- **Apps tab:** Slack moves from "coming later" to installable. Its card shows the workspace name, number of channel
  handles and linked people, and a "Disconnected" state.
- **Slack app settings:** workspace, handles (channel name, rule count, add/remove), the move offer while Webhook
  handles for this workspace exist, linked-people count, the current user's "Connect Slack", and "Remove app".
- **Members tab:** Slack badge per member; the signed-in user's row has Connect/Disconnect.
- **Rule editor:** unchanged apart from listing Slack handles under the Slack app.
- Phone layout follows the Apps tab's existing patterns. Viewers and members see app and handle names; only admins and
  owners install, remove, add handles or run the move.

## Docs

The user guide gets a Slack app page: install, channels (including private channels), mentions and how people are
matched, Connect Slack, moving from webhooks, removing the app. The notifications page links to it.

## Security notes for the builder

- OAuth and Sign in with Slack `state`: random, single use, bound to user session and integration, short expiry.
- Redirect URIs are fixed GitGazer API routes registered in the Slack app; never taken from the request.
- The bot token is encrypted at rest (mechanism is the builder's call, e.g. KMS envelope encryption; the worker runs in
  a VPC without IPv4 egress, so the builder checks the chosen service is reachable) and decrypted only where a Slack
  call is made.
- New tables get the tenant separation policies and are not granted to `gitgazer_mcp`.
- No emails or Slack IDs in logs; log counts and booleans.

## Left to the builder

- Table and column names beyond those fixed above; whether Slack app settings and links are one table or several.
- API route shapes for install, callbacks, channels, connect/disconnect and the move.
- Token encryption mechanism within the constraints above.
- Exact refresh intervals if 7 days / 24 hours turn out to be awkward.
- UI layout within the existing Apps and Members patterns.
- Test layout, following existing tests in each package.

## Calls made by Claude (not explicitly confirmed by the product owner)

- One Slack workspace per integration; removing the app is required before switching workspace.
- Disconnects are detected lazily on the next failed call, since there is no Events API.
- Link refresh: 7 days for a found link, 24 hours for "not found"; lookup failures send the alert without a mention.
- Lookup order: GitGazer email, then GitHub profile email, then commit email.
- Members see only whether someone is linked, never the Slack ID.
- A disconnect sticks (no automatic re-link until the person connects again).
- Removing the Slack app revokes its token and deletes its handles and links.
- The move runs per handle in its own transaction and skips handles for other workspaces.
