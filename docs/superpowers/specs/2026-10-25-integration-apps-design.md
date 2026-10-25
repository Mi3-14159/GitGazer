# Integration apps — design

Mockup: [2026-10-25-integration-apps-mockup.html](2026-10-25-integration-apps-mockup.html) (desktop and phone).

## Why

Today an "integration" is two things at once: the tenant (name, owner, members, rules, all collected data) and the
GitHub connection (webhook secret, GitHub App installations, org member sync). Notifications are a list of raw Slack
webhook URLs inside each rule. There is no place to attach anything else, so every new destination or source needs a
workaround. The trigger was Slack @mentions: an incoming webhook can post but cannot look anyone up, which forced the
parked design on branch `slack-mentions/design` to have each member paste in their own Slack member ID.

This project keeps the integration as the container and introduces **apps** that are installed into it. Version one
ships two apps, GitHub and Webhook (Slack incoming webhooks only). It is the groundwork for a real Slack app (lookup by
email, direct pings), generic webhooks, GitLab, Jira and email later.

## Goals

- An integration holds installed apps. Each app has a type, its own settings and, for destinations, its own
  **notification handles**.
- **GitHub app:** takes over the GitHub-specific settings of today's integration. Every existing integration gets one
  during migration, and nothing that works today stops working.
- **Webhook app:** holds named handles, each one a Slack incoming webhook URL. Alerts look exactly as today.
- Notification rules send to **handles** (app + handle) instead of holding URLs.
- A page per integration with Apps, Members and Settings tabs that works on desktop and phone.

## Non-goals (this version)

- No generic (non-Slack) webhooks. Handle URLs stay limited to `hooks.slack.com`, as today. This keeps the outbound
  path unchanged: `http-proxy` already allows `hooks.slack.com`, and no new egress, signing, or endpoint verification is
  needed.
- No Slack app, GitLab, Jira or email. The catalog shows Slack, GitLab and Jira as "coming later" and nothing more.
- No change to the alert content; `buildSlackAlert` stays as it is.
- No source-neutral data model. GitHub data stays in the `github` schema; GitLab will get its own schema.
- No `app_id` column on the GitHub data tables (runs, jobs, pull requests, …). The `github` schema only holds GitHub
  data and an integration has at most one GitHub app, so it would repeat `integration_id`.
- No rename of `integration` / `integration_id` anywhere.
- No changes to the parked Slack mentions design; it will be revisited once the Slack app exists.

## Anti-goals (failure even if it technically works)

- Breaking any existing setup: the ingest URL `/api/import/:integrationId`, its secret, GitHub App installations,
  org sync, and every rule's Slack delivery must keep working after the migration without user action.
- Webhook URLs visible to non-admins, to the MCP role, or in logs. A Slack webhook URL is a bearer secret.
- Removing an app deleting collected history.

## Decided with the product owner

- The integration stays the container; nothing is renamed. Apps are installed into an integration and link to it by
  `integration_id`.
- GitHub becomes an app. Collected data stays keyed to the integration only; no `app_id` on GitHub data.
- Removing the GitHub app stops new data and keeps everything already collected as history.
- Version one apps: GitHub and Webhook, and the Webhook app supports Slack incoming webhooks only.
- A rule's destination is **app → notification handle**. One Webhook app holds many handles (one per URL). Future apps
  bring their own handles (Slack: channels and people; Jira: projects) without changing rules.
- Teams and generic webhooks are out of scope.
- UI: option B from the mockup, a page per integration with tabs, plus the phone layout shown there.
- Rollout: a short cutover with fix-forward; lambda rollback is not required.

## Model

### Apps

New table `gitgazer.integration_apps`:

| Column           | Notes                                                           |
| ---------------- | --------------------------------------------------------------- |
| `integration_id` | FK to `github.integrations`, `on delete cascade`                |
| `app_id`         | uuid                                                            |
| `type`           | `github` \| `webhook` (an `as const` tuple with a derived type) |
| `created_at`     |                                                                 |

Primary key `(integration_id, app_id)`, unique `(integration_id, type)`: at most one app of each type per integration in
this version. Writer/reader tenant separation policies like every other tenant table. Not granted to `gitgazer_mcp`.

### GitHub app

- Its settings move off `github.integrations` into a GitHub app settings table keyed by `(integration_id, app_id)`
  (composite FK to `integration_apps`, cascade): `secret` and `org_sync_default_role`.
- `github_app_installations`, `github_app_webhooks`, `github_org_members` and `pending_org_sync` already belong to
  GitHub and stay where they are, keyed by `integration_id`. The UI and API present them under the GitHub app.
- One GitHub app holds all of an integration's GitHub App installations and the manual-webhook setup (secret + ingest
  URL). Both ways of receiving data that exist today remain.
- **New integrations** get a GitHub app installed automatically, so creating an integration works as today.
- **Removing the GitHub app** (owner/admin): runs the existing unlink flow for each installation (which removes the
  webhooks GitGazer created), deletes the settings row and with it the secret, so `/api/import/:integrationId` rejects
  further deliveries. Collected data, org-synced members and their roles stay. Reinstalling creates a new secret.
- `verifyGithubSign` reads the secret from the GitHub app settings instead of `integrations`. An integration without a
  GitHub app rejects deliveries the same way an unknown integration does today.

### Notification handles

Handles are generic across apps so rules can reference any future app's handles through one foreign key:

- `gitgazer.notification_handles`: `(integration_id, handle_id)` primary key, `app_id` (composite FK to
  `integration_apps`, cascade), `name`, `created_at`, `updated_at`.
- `gitgazer.webhook_handle_details`: 1:1 with a handle of a Webhook app, holding `url`. Validated with today's
  `isAllowedWebhookUrl` (HTTPS, `hooks.slack.com`).

Both tables have tenant separation policies and are not granted to `gitgazer_mcp`. A Webhook app may hold at most 20
handles.

A handle's app type is derived through `app_id`; `notification_handles` gets no `app_type` column. The API ensures a
`webhook_handle_details` row only exists for a handle whose app is of type `webhook` (decided with the product owner:
no database-level type check).

### Rules → handles

`notification_rules.channels` is replaced by `gitgazer.notification_rule_destinations`
`(integration_id, rule_id, handle_id)`, with composite FKs to the rule and the handle (both `on delete cascade`).

- Deleting a handle removes it from rules; a rule left without destinations stays but sends nothing, and the rule
  editor shows a warning.
- The rule editor picks an installed app, then one of its handles.
- The per-rule "log details" setting stays as it is.
- When several matching rules point at the same handle, the handle gets one message per failed job, not one per rule.
  Log details are included if any of those rules has them on. (Today a URL used by two matching rules gets two posts.)

## Delivery

Unchanged path: the worker builds the Slack payload with `buildSlackAlert` and posts it through `proxyFetch` and the
existing `http-proxy` allowlist. The only change is where the URL comes from (handles instead of `channels`).

## Existing problems this fixes

- `GET /api/notifications` currently returns full Slack webhook URLs to every member. Rules now reference handles;
  handle URLs are returned to admins and owners only.
- `retries: 3` in `alerting.controller.ts` does nothing when the proxy is used. Either make it work or remove it.

Out of scope, noted for later (from the Security Engineer review, and required before generic webhooks): the
`http-proxy` lambda follows redirects without re-checking the host, reads response bodies without a size limit, returns
raw error messages, and `isAllowedWebhookUrl` compares hostname prefixes only. Generic webhooks will need their own
guarded egress mode, endpoint verification, signing and rate limits.

## Migration

Migrations run by hand (`pnpm run migrate` in `packages/db`), separately from the lambda deploy. The product owner
accepts a **short cutover**: the expand migration runs immediately before the deploy, and nobody rotates secrets,
creates integrations or edits rules in the few minutes between. Rolling the lambdas back afterwards is not supported;
problems are fixed forward. No dual-write release.

1. **Expand:** create the new tables. For every integration, insert a GitHub app and copy `secret` and
   `org_sync_default_role` into its settings. For every integration whose rules contain webhook URLs, insert a Webhook
   app; each distinct URL becomes one handle named "Slack webhook 1", "Slack webhook 2", … in order of first use; fill
   `notification_rule_destinations`.
2. **Deploy** code that reads and writes only the new tables.
3. **Contract** (a later migration): drop `integrations.secret`, `integrations.org_sync_default_role` and
   `notification_rules.channels`, and adjust the MCP column grants on `integrations` if needed.

Secret values and the ingest URL are copied, not regenerated, so every webhook configured in GitHub keeps verifying.

## UI

- `/integrations` stays the list of integrations; each entry links to `/integrations/:integrationId`, which has the tabs
  **Apps**, **Members** (today's `/integrations/:integrationId/users`, which redirects there) and **Settings** (rename,
  leave, delete).
- **Apps tab:** installed apps as cards (short stats), then the catalog with Slack, GitLab and Jira marked "coming
  later". Opening an app shows its settings: for GitHub, everything `IntegrationCard.vue` shows today (secret,
  installations, events, org sync); for Webhook, the handle list with name, host and rule count, and "Add handle".
- **Phone:** as in the mockup: the top nav shows icons only (as today), cards stack, handles become two-line rows, the
  primary action is full width.
- Viewers and members see apps and handle names; only admins and owners see URLs and secrets, and install, configure or
  remove apps and handles.
- Build from the existing Radix Vue / Tailwind components and the colors in `apps/web/src/assets/main.css`; the mockup
  is a layout reference, not pixel spec. Its generic-webhook row, format column and verification statuses are out of
  scope.

## Constraints the builder must handle

- **Naming collision:** "GitHub app" (a GitGazer app) vs. "GitHub App" (GitHub's product, `github_app_installations`).
  Code and UI must keep them apart; prefer `integration_apps` / `IntegrationApp` for GitGazer's concept.
- New tables need the tenant separation policies; follow the `db-migration` skill.
- The smart-failure-alerts verdict, log fetch and AI summary keep working exactly as today.

## Left to the builder

- Table and column names beyond the ones fixed above; whether GitHub app settings are a table or columns on a shared
  settings table.
- API route shapes for apps and handles.
- Whether the dead `retries` option is fixed or removed.

## Calls made by Claude (not explicitly confirmed by the product owner)

- At most one app of each type per integration in this version.
- The app type is `webhook`, not `slack-webhook`, so generic URLs can be allowed later without a new app type, and
  "Slack" stays free for the real Slack app.
- Handles are a generic table with per-app detail tables, so future apps plug into rules without schema changes to
  rules.
- No handle status, endpoint verification or auto-disable; failures are logged as today.
- Removing the GitHub app runs the existing unlink flow and deletes the secret; org-synced members stay.
- New integrations get a GitHub app automatically.
- Limit of 20 handles per Webhook app.
- One message per handle per failed job, even when several matching rules share the handle.
- Migrated handles named "Slack webhook N".
- `/integrations/:integrationId/users` redirects to the Members tab.
