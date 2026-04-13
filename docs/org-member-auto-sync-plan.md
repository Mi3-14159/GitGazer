# Auto-Sync GitHub Organization Members to GitGazer Integrations

## Status

Proposed

## Context

When a GitHub App is installed on a GitHub organization, every GitHub user who is a member of that organization should be automatically added to the GitGazer integration linked to that installation. Today, users are added to integrations **only** through the manual invitation flow (`integration_invitations` → accept → `user-assignments`). There is no concept of GitHub org membership in GitGazer.

### Current State

| Concept                         | Current Behavior                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub App installed on org     | Creates `github_app_installations` row with `integration_id = null`                                                                                                               |
| Link installation → integration | Manual UI action (PATCH `/api/integrations/:id/installation`)                                                                                                                     |
| Add user to integration         | Manual invitation flow (invite → accept → `user-assignments` row)                                                                                                                 |
| User identity                   | Cognito (GitHub OIDC). `nickname` = GitHub login. GitHub numeric user ID available via Cognito custom attribute `custom:github_id`. No GitHub user ID stored in `gitgazer.users`. |
| GitHub org members              | Not tracked at all                                                                                                                                                                |

### Identity Bridge Problem

GitGazer users are identified by **Cognito ID** (UUID). The only GitHub-specific data on `gitgazer.users` is:

- `nickname` (GitHub login) — available at auth time via Cognito OIDC attribute mapping
- `email` — may or may not match the GitHub email

GitHub org members are identified by **GitHub user ID** (integer) and **login** (string, can change).

To auto-add org members we need a reliable way to match a GitHub org member to a GitGazer user. Cognito will be configured to sync the **numeric GitHub user ID** into a custom attribute (`custom:github_id`) via OIDC attribute mapping. This immutable ID is the primary join key for matching.

---

## Design

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     GitHub Organization                          │
│  members: alice, bob, charlie (GitHub logins)                    │
└────────────┬─────────────────────────────────────────────────────┘
             │ GitHub App installed (webhook: installation.created)
             ▼
┌──────────────────────────────────────────────────────────────────┐
│            GitGazer API — github-app.controller                  │
│  1. Upsert github_app_installations row                         │
│  2. If account_type = "Organization":                            │
│     → Dispatch org_member_sync task to SQS worker queue          │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────┐
│            Worker Lambda (SQS consumer)                          │
│  Receives org_member_sync task:                                  │
│  1. Fetch all org members via GitHub API (paginated)             │
│  2. Bulk upsert into github_org_members (batched)                │
└────────────┬─────────────────────────────────────────────────────┘
             │
             │ Later: installation linked to integration
             ▼
┌──────────────────────────────────────────────────────────────────┐
│            Link Installation Flow                                │
│  1. Link installation to integration                             │
│  2. Resolve org members → GitGazer users (by github_id)          │
│  3. Auto-insert user-assignments for matched users               │
│  4. Create pending-invites for unmatched members (optional)      │
└──────────────────────────────────────────────────────────────────┘
             │
             │ Ongoing: member events
             ▼
┌──────────────────────────────────────────────────────────────────┐
│            Webhook: organization.member_added/removed            │
│  1. Update github_org_members (single-row, inline)               │
│  2. If installation is linked to integration:                    │
│     → Auto-add or remove user from user-assignments              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1 — Store GitHub Identity on Users

**Goal**: Enable matching GitHub org members to GitGazer users.

#### 1.1 Add `github_id` and `github_login` to `gitgazer.users`

Add two nullable columns to `gitgazer.users`:

| Column         | Type           | Notes                                                                      |
| -------------- | -------------- | -------------------------------------------------------------------------- |
| `github_id`    | `bigint`       | GitHub user ID (stable, never changes). **Primary key for sync matching.** |
| `github_login` | `varchar(255)` | GitHub login (can change, kept for display and fallback)                   |

**Files to change:**

- `packages/db/src/schema/gitgazer.ts` — add columns to `users` table
- New Drizzle migration via `npx drizzle-kit generate`

#### 1.2 Configure Cognito to sync GitHub user ID

Add a **custom attribute** `custom:github_id` to the Cognito User Pool and map the GitHub OIDC `id` claim (the numeric GitHub user ID) to it via the identity provider attribute mapping. This ensures every Cognito user record carries the immutable GitHub user ID.

**Files to change:**

- `infra/cognito.tf` — add `custom:github_id` schema attribute to the User Pool; add OIDC attribute mapping `id → custom:github_id` on the GitHub identity provider

#### 1.3 Populate on login

The authentication middleware ([authentication.ts](apps/api/src/shared/middleware/authentication.ts)) already upserts users from Cognito JWT claims. The `nickname` claim maps to GitHub `login`.

Extend the upsert to:

1. Set `github_id` from the `custom:github_id` claim (the numeric GitHub user ID synced by Cognito)
2. Set `github_login` from the `nickname` claim

The `github_id` is the **primary identifier** used for all org member sync matching. `github_login` is stored for display purposes and as a fallback.

**Files to change:**

- `apps/api/src/shared/middleware/authentication.ts` — read `custom:github_id` from JWT claims; populate `github_id` and `github_login` on upsert

---

### Phase 2 — Track Organization Members

**Goal**: Know which GitHub users are members of an organization associated with a GitHub App installation.

#### 2.1 New `github_org_members` table

```
github.github_org_members
├── installation_id  bigint  FK → github_app_installations.installation_id (cascade)
├── github_user_id   bigint  NOT NULL
├── github_login     varchar(255) NOT NULL
├── role             varchar(20) NOT NULL  -- "admin" | "member"
├── synced_at        timestamptz NOT NULL DEFAULT now()
└── PK(installation_id, github_user_id)
```

This table is **not tenant-scoped** (no `integration_id` PK prefix) because installations can exist without being linked to an integration. RLS is not applied; access is controlled through the API layer.

**Files to change:**

- `packages/db/src/schema/github/workflows.ts` — add table definition
- New Drizzle migration

#### 2.2 Dispatch org member sync to worker

A GitHub organization can have **thousands of members**. Fetching them via the GitHub API (paginated, 100/page) and bulk-upserting into the database is too slow and resource-intensive to run inline in a webhook handler (API Gateway has a 29s timeout; the REST Lambda has a 30s timeout). All full org member syncs are dispatched to the **worker Lambda** via the existing SQS webhook queue.

##### Worker task: `org_member_sync`

Extend the existing SQS message format with a new task type:

```typescript
interface OrgMemberSyncTask {
    taskType: 'org_member_sync';
    installationId: number;
    accountLogin: string;
}
```

The worker Lambda (`batch-processor.ts`) already processes SQS records. Add a branch that checks for `taskType === 'org_member_sync'` and delegates to a new `syncOrgMembers` function.

##### Sync logic (runs in worker)

1. Use the installation's Octokit client to call `octokit.orgs.listMembers({ org })` (paginated, per role)
2. Batch upsert results into `github_org_members` in chunks of 500 rows
3. On failure, the SQS retry/DLQ mechanism handles retries (no silent swallowing)

##### Dispatch points

The API Lambda dispatches an `org_member_sync` SQS message in these cases:

- `installation.created` — when a GitHub App is installed on an Organization
- `installation.new_permissions_accepted` — backfill for existing installations that accept the new `members:read` permission

Because the work is async, the webhook handler returns immediately. The worker picks up the task from SQS and performs the potentially long-running sync.

**Prerequisite**: The GitHub App must request the **`members:read`** permission. This is a GitHub App permission change (configured in the GitHub App settings on github.com), not a code change. Existing installations will receive an `installation.new_permissions_accepted` event when the org admin approves.

**Files to change:**

- `apps/api/src/shared/clients/sqs.client.ts` — add `sendOrgMemberSyncTask(queueUrl, task)` function
- `apps/api/src/shared/clients/github-app.client.ts` — add `listOrgMembers(installationId, org)` function
- `apps/api/src/domains/github-app/github-app.controller.ts` — dispatch SQS message in `installation.created` and `new_permissions_accepted` handlers
- `apps/api/src/domains/webhooks/worker/batch-processor.ts` — handle `org_member_sync` task type
- New helper: `apps/api/src/domains/github-app/org-member-sync.ts` — `syncOrgMembers` logic (fetch + batched upsert)

#### 2.3 Subscribe to `organization` webhook events

The GitHub App needs to receive `organization` events (`member_added`, `member_removed`, `member_invited`) to keep `github_org_members` in sync.

Add `"organization"` to the default `webhook_events` list or handle it at the app level (not per-integration webhook).

`organization.member_added` and `organization.member_removed` are **single-member operations** (one member per event). These are small enough to handle inline in the webhook handler — no SQS dispatch needed.

**Files to change:**

- `apps/api/src/domains/github-app/github-app.controller.ts` — add `case 'organization':` handler
- `apps/api/src/shared/helpers/validation.ts` — add `organization` to valid event types

---

### Phase 3 — Auto-Add Members on Link

**Goal**: When an installation is linked to an integration, auto-add org members to the integration.

#### 3.1 Configurable default sync role

Add an `org_sync_default_role` column to `github.integrations`:

| Column                  | Type          | Default    | Notes                                                         |
| ----------------------- | ------------- | ---------- | ------------------------------------------------------------- |
| `org_sync_default_role` | `varchar(20)` | `'viewer'` | One of the existing `MEMBER_ROLES` values (excluding `owner`) |

Integration owners/admins can change this setting via a new endpoint:

```
PATCH /api/integrations/:id/org-sync-settings
Body: { "defaultRole": "member" }
```

Allowed values: `viewer`, `member`, `admin`. The `owner` role is never assignable via org sync.

**Files to change:**

- `packages/db/src/schema/github/workflows.ts` — add `orgSyncDefaultRole` column to `integrations`
- `apps/api/src/domains/integrations/integrations.routes.ts` — new PATCH endpoint for org-sync settings
- `apps/api/src/domains/integrations/integrations.controller.ts` — handler for updating the setting
- New Drizzle migration

**Status**: ✅ Backend endpoint implemented. ✅ Frontend UI implemented.

##### Frontend: Org-sync default role editor

The `OrgSyncSettings.vue` component renders inside the integration card when a GitHub App installation is linked. It shows the current default role as a badge and allows admins to change it via an inline editor (similar to the webhook event editor pattern).

- `apps/web/src/components/integrations/OrgSyncSettings.vue` — inline role picker component
- `apps/web/src/composables/useIntegration.ts` — `updateOrgSyncDefaultRole()` API call
- `apps/web/src/composables/useIntegrationCrud.ts` — `handleUpdateOrgSyncRole()` handler
- `apps/web/src/components/integrations/IntegrationCard.vue` — wires `OrgSyncSettings` into the card
- `apps/web/src/views/IntegrationsPage.vue` — connects the `update-org-sync-role` event

The component is visible only when the integration has at least one GitHub App installation linked, and is read-only for non-admin roles.

#### 3.2 Resolve and insert members on link

When `linkInstallation` is called (PATCH `/api/integrations/:id/installation`):

1. Read `github_org_members` for the installation
2. Read the integration's `org_sync_default_role` setting
3. For each org member, look up `gitgazer.users` by `github_id` (the immutable numeric GitHub user ID)
4. For **matched** users: insert into `user-assignments` with the configured role, using `onConflictDoNothing` to avoid overwriting existing roles
5. For **unmatched** users (GitHub members with no GitGazer account yet): store as pending with the configured role (see Phase 5)
6. Create event log entries documenting the auto-sync

**Files to change:**

- `apps/api/src/domains/integrations/integrations.controller.ts` — extend `linkInstallation`
- New helper: `apps/api/src/domains/members/org-member-sync.ts`

#### 3.3 Default role behavior

The default role is `viewer` (least privilege) unless explicitly changed by an integration owner/admin. The `owner` role can never be assigned via org sync — role escalation to `owner` remains a manual operation. Changing the default role does **not** retroactively update existing members; it only applies to future syncs.

---

### Phase 4 — Ongoing Sync via Webhooks

**Goal**: Keep integration membership in sync as org membership changes.

#### 4.1 Handle `organization.member_added`

When a member is added to the org:

1. Upsert into `github_org_members`
2. If the installation is linked to an integration:
    - Read the integration's `org_sync_default_role` setting
    - Look up `gitgazer.users` by `github_id`
    - If found: insert `user-assignments` with the configured role (`onConflictDoNothing`)
    - If not found: store as pending with the configured role for deferred matching

#### 4.2 Handle `organization.member_removed`

When a member is removed from the org:

1. Delete from `github_org_members`
2. If the installation is linked to an integration:
    - Look up `gitgazer.users` by `github_id`
    - If found: delete from `user-assignments` **only if the member was auto-synced** (see Phase 6 for tracking provenance)
    - Never remove `owner` or manually-invited members

#### 4.3 Periodic full sync (background job)

Webhook delivery is not guaranteed. Add a periodic reconciliation job:

1. Triggered on a schedule (e.g., daily via EventBridge)
2. For each installation with `account_type = "Organization"`: dispatch an `org_member_sync` SQS message
3. The worker Lambda picks up each task and performs the same `syncOrgMembers` logic used during installation (Phase 2.2)
4. After sync, diff `github_org_members` against `user-assignments` for linked integrations and reconcile
5. Log drift detected in event log

This reuses the same worker task and sync logic from Phase 2.2 — the EventBridge rule simply acts as a scheduled dispatcher.

**Files to change:**

- New Lambda handler: `apps/api/src/handlers/org-sync-scheduler.ts` — queries all org installations and dispatches SQS messages
- `infra/` — EventBridge schedule rule + Lambda invocation for the scheduler

---

### Phase 5 — Deferred Matching for Unknown Users

**Goal**: When a GitHub org member doesn't have a GitGazer account yet, automatically add them when they first log in.

#### 5.1 New `pending_org_members` table (or flag on `github_org_members`)

Add a relationship table or flag that tracks "this GitHub user should be added to integration X when they create a GitGazer account."

Option A — Extend `github_org_members` with `integration_id` (nullable):

```
pending auto-adds:
  installation_id + github_user_id + integration_id → "should be added when user registers"
```

Option B — Separate table (cleaner):

```
github.pending_org_sync
├── integration_id   uuid FK → integrations.integration_id (cascade)
├── github_login     varchar(255) NOT NULL
├── github_user_id   bigint NOT NULL
├── role             varchar(20) NOT NULL  -- snapshot of org_sync_default_role at time of creation
├── created_at       timestamptz DEFAULT now()
└── PK(integration_id, github_user_id)
```

**Recommended: Option B** — keeps concerns separate and is easy to clean up.

#### 5.2 Check pending on login

In the authentication middleware, after upserting the user:

1. Look up `pending_org_sync` by `github_id` (sourced from the `custom:github_id` Cognito claim)
2. For each match: insert `user-assignments` and delete the pending row
3. This happens **once** at first login — negligible performance impact

**Files to change:**

- `packages/db/src/schema/github/workflows.ts` — new table
- `apps/api/src/shared/middleware/authentication.ts` — add post-upsert pending check
- New Drizzle migration

---

### Phase 6 — Track Membership Provenance

**Goal**: Distinguish between manually-invited members and auto-synced members so removal logic is safe.

#### 6.1 Add `source` column to `user-assignments`

| Value      | Meaning                                                             |
| ---------- | ------------------------------------------------------------------- |
| `manual`   | Invited through the invitation flow (default, backwards-compatible) |
| `org_sync` | Auto-added from GitHub org membership                               |

This allows the `organization.member_removed` handler to only remove `org_sync` members and never touch manually-managed ones.

**Files to change:**

- `packages/db/src/schema/github/workflows.ts` — add `source` column to `userAssignments`
- New Drizzle migration (default `'manual'` for existing rows)

---

## GitHub App Permission Changes

The following permission must be added to the GitHub App registration on github.com:

| Permission           | Access | Why                      |
| -------------------- | ------ | ------------------------ |
| Organization members | Read   | List org members via API |

The following webhook event must be subscribed at the app level:

| Event          | Why                                              |
| -------------- | ------------------------------------------------ |
| `Organization` | Receive `member_added` / `member_removed` events |

> Existing installations will receive a notification to approve the new permission. The `installation.new_permissions_accepted` event fires when approved.

---

## Database Migration Summary

| #   | Migration                                            | Description                              |
| --- | ---------------------------------------------------- | ---------------------------------------- |
| 1   | Add `github_id`, `github_login` to `gitgazer.users`  | Enable GitHub identity matching          |
| 2   | Create `github.github_org_members`                   | Track org membership per installation    |
| 3   | Add `org_sync_default_role` to `github.integrations` | Configurable default role for org sync   |
| 4   | Create `github.pending_org_sync`                     | Deferred matching for unregistered users |
| 5   | Add `source` to `github.user-assignments`            | Track membership provenance              |

---

## Trade-offs & Decisions

### Matching strategy: `github_id` vs. `github_login` vs. email

| Approach                     | Pro                                           | Con                                                           |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| GitHub user ID (`github_id`) | Immutable, guaranteed unique, never changes   | Requires Cognito attribute mapping to surface in JWT claims   |
| GitHub login (`nickname`)    | Human-readable, available without extra setup | Logins can change (rare but possible)                         |
| Email                        | Familiar to users                             | GitHub emails can be private/hidden; Cognito email may differ |

**Decision**: Use `github_id` (numeric GitHub user ID) as the **primary match key**. Cognito is configured to sync this value into a custom attribute (`custom:github_id`) via OIDC attribute mapping, making it available in JWT claims at login time. This is the most reliable join key because GitHub user IDs are immutable. `github_login` is stored for display and as a secondary fallback.

### Auto-remove on org departure vs. keep access

| Approach      | Pro                        | Con                                           |
| ------------- | -------------------------- | --------------------------------------------- |
| Auto-remove   | Clean, mirrors org reality | Could surprise users; data loss if accidental |
| Keep + notify | Safe, no surprise removal  | Stale membership, security concern            |

**Decision**: Auto-remove only `org_sync` sourced members. Keep `manual` members. Log all removals in event log. Integration owners can override.

### Sync at install vs. sync at link

| Approach             | Pro                     | Con                                              |
| -------------------- | ----------------------- | ------------------------------------------------ |
| Sync at install time | Data ready when linking | Wasteful if never linked; no integration context |
| Sync at link time    | Only when needed        | Slight delay on first link                       |

**Decision**: Fetch and store org members on `installation.created` (Phase 2), but only create `user-assignments` on link (Phase 3). This keeps the member data ready but doesn't create assignments for an unlinked installation.

### Inline processing vs. worker dispatch for full org sync

| Approach                  | Pro                                   | Con                                                                    |
| ------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Inline in webhook handler | Simple, no extra infra                | Blocks webhook response; can timeout for large orgs (API GW 29s limit) |
| Dispatch to SQS worker    | Non-blocking; retries via DLQ; scales | Adds async complexity; sync result not immediately visible             |

**Decision**: Dispatch full org member syncs (thousands of members, paginated API calls) to the **SQS worker Lambda**. The existing webhook queue infrastructure (FIFO, DLQ, partial batch failures) provides reliable delivery and retry semantics. Single-member operations (`member_added`/`member_removed`) remain inline since they are bounded to one DB write each.

---

## Sequencing & Rollout

| Phase                              | Can ship independently | Depends on                                          |
| ---------------------------------- | ---------------------- | --------------------------------------------------- |
| Phase 1 (GitHub identity on users) | Yes                    | Nothing                                             |
| Phase 2 (Track org members)        | Yes                    | GitHub App permission change                        |
| Phase 3 (Auto-add on link)         | Yes                    | Phase 1 + Phase 2                                   |
| Phase 4 (Ongoing sync)             | Yes                    | Phase 2 + Phase 3                                   |
| Phase 5 (Deferred matching)        | Yes                    | Phase 1 + Phase 3                                   |
| Phase 6 (Provenance tracking)      | Yes                    | Nothing (but needed before Phase 4.2 removal logic) |

**Recommended order**: Phase 1 → Phase 6 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1 and Phase 6 are safe, backwards-compatible schema additions that can be shipped immediately. Phase 2 requires the GitHub App permission change which may take time for existing installations to accept.

---

## Security Considerations

- **Least privilege**: Auto-synced members get `viewer` role by default (configurable per integration to `viewer`, `member`, or `admin`)
- **Never auto-grant owner**: The `owner` role cannot be assigned via org sync; escalation to owner remains manual
- **RLS**: All `user-assignments` writes go through `withRlsTransaction` with `gitgazerWriter`
- **Webhook signature verification**: `organization` events go through existing `verifyGithubSign` middleware
- **Rate limiting**: GitHub API calls for member listing are paginated and bounded by org size; full syncs run in the worker Lambda (120s timeout) to avoid blocking webhook handlers
- **Worker isolation**: Full org syncs are dispatched to SQS and processed by the worker Lambda, protecting the REST Lambda from timeouts on large orgs (several thousand members)
- **No PII leakage**: `github_org_members` stores only GitHub public profile data (login, user ID, role)
