# ADR: Role-Based Access Control (RBAC) for Integration Members

## Status

Proposed

## Context

GitGazer has four member roles defined in `MEMBER_ROLES` — **owner**, **admin**, **member**, **viewer** — but no centralized authorization framework enforces them. Today, permission checks are scattered across individual route handlers and controllers as ad-hoc `if` statements (e.g., owner-only delete via `ownerId = userId` in the integrations controller, owner/admin gating via role lookups in the members controller). This creates several problems:

1. **Inconsistency** — Some write endpoints have no role check at all; any integration member can modify notification rules or rename integrations.
2. **Fragility** — Adding a new endpoint requires the developer to remember which roles apply, duplicating logic each time.
3. **No single source of truth** — The actual permission model is implicit, spread across 6+ files with no documentation.

We need a declarative, centralized RBAC system that maps every API operation to the minimum required role, is enforced via middleware, and is easy to audit and extend.

## Decision

### Role Hierarchy

Roles form a strict linear hierarchy. A higher role inherits all permissions of lower roles:

```
owner > admin > member > viewer
```

| Rank | Role     | Description                                                                       |
| ---- | -------- | --------------------------------------------------------------------------------- |
| 0    | `owner`  | Full control including destructive operations. One per integration (the creator). |
| 1    | `admin`  | Full management except integration deletion and ownership transfer.               |
| 2    | `member` | Day-to-day operational access. Cannot manage members or invitations.              |
| 3    | `viewer` | Read-only access to all data within the integration scope.                        |

### Permission Matrix

Every protected API operation is assigned a minimum required role. A user with a higher-ranked role automatically satisfies lower requirements.

#### Integration Management

| Operation                          | Endpoint                                                        | owner | admin | member | viewer |
| ---------------------------------- | --------------------------------------------------------------- | :---: | :---: | :----: | :----: |
| List integrations                  | `GET /api/integrations`                                         |  ✅   |  ✅   |   ✅   |   ✅   |
| Create integration                 | `POST /api/integrations`                                        |  ✅   |  ✅   |   ✅   |   ✅   |
| Rename integration                 | `PUT /api/integrations/:id`                                     |  ✅   |  ✅   |   ❌   |   ❌   |
| **Delete integration**             | `DELETE /api/integrations/:id`                                  |  ✅   |  ❌   |   ❌   |   ❌   |
| Rotate webhook secret              | `POST /api/integrations/:id/rotate-secret`                      |  ✅   |  ✅   |   ❌   |   ❌   |
| Link GitHub App installation       | `POST /api/integrations/:id/github-app`                         |  ✅   |  ✅   |   ❌   |   ❌   |
| Unlink GitHub App installation     | `DELETE /api/integrations/:id/github-app/:installationId`       |  ✅   |  ✅   |   ❌   |   ❌   |
| Update webhook event subscriptions | `PATCH /api/integrations/:id/github-app/:installationId/events` |  ✅   |  ✅   |   ❌   |   ❌   |

> **Create integration** is available to all authenticated users because it creates a new, independent integration where the caller becomes the owner. It does not modify an existing integration.

#### Member & Invitation Management

| Operation          | Endpoint                                                      | owner | admin | member | viewer |
| ------------------ | ------------------------------------------------------------- | :---: | :---: | :----: | :----: |
| List members       | `GET /api/integrations/:id/members`                           |  ✅   |  ✅   |   ✅   |   ✅   |
| Change member role | `PATCH /api/integrations/:id/members/:userId/role`            |  ✅   |  ✅   |   ❌   |   ❌   |
| Remove member      | `DELETE /api/integrations/:id/members/:userId`                |  ✅   |  ✅   |   ❌   |   ❌   |
| List invitations   | `GET /api/integrations/:id/invitations`                       |  ✅   |  ✅   |   ✅   |   ✅   |
| Create invitation  | `POST /api/integrations/:id/invitations`                      |  ✅   |  ✅   |   ❌   |   ❌   |
| Resend invitation  | `POST /api/integrations/:id/invitations/:invitationId/resend` |  ✅   |  ✅   |   ❌   |   ❌   |
| Revoke invitation  | `DELETE /api/integrations/:id/invitations/:invitationId`      |  ✅   |  ✅   |   ❌   |   ❌   |
| Accept invitation  | `POST /api/invitations/accept`                                |  ✅   |  ✅   |   ✅   |   ✅   |

**Additional constraints** (enforced in controller logic, not middleware):

- An **admin** cannot change another admin's role or remove them — only an **owner** can manage admins.
- An **admin** cannot invite someone with the **owner** role.
- The **owner** role cannot be removed from an integration; ownership transfer is a separate future operation.
- A user can always **remove themselves** from an integration (leave), regardless of their role, except the owner.

#### Notification Rules

| Operation                | Endpoint                                             | owner | admin | member | viewer |
| ------------------------ | ---------------------------------------------------- | :---: | :---: | :----: | :----: |
| List notification rules  | `GET /api/notifications`                             |  ✅   |  ✅   |   ✅   |   ✅   |
| Create notification rule | `POST /api/integrations/:id/notifications`           |  ✅   |  ✅   |   ✅   |   ❌   |
| Update notification rule | `PUT /api/integrations/:id/notifications/:ruleId`    |  ✅   |  ✅   |   ✅   |   ❌   |
| Delete notification rule | `DELETE /api/integrations/:id/notifications/:ruleId` |  ✅   |  ✅   |   ✅   |   ❌   |

#### Monitoring & Analytics (Read-Only)

| Operation          | Endpoint                        | owner | admin | member | viewer |
| ------------------ | ------------------------------- | :---: | :---: | :----: | :----: |
| List workflows     | `GET /api/workflows`            |  ✅   |  ✅   |   ✅   |   ✅   |
| Get overview       | `GET /api/overview`             |  ✅   |  ✅   |   ✅   |   ✅   |
| Get metrics widget | `GET /api/metrics/widget`       |  ✅   |  ✅   |   ✅   |   ✅   |
| List repositories  | `GET /api/metrics/repositories` |  ✅   |  ✅   |   ✅   |   ✅   |
| List topics        | `GET /api/metrics/topics`       |  ✅   |  ✅   |   ✅   |   ✅   |

#### Event Log

| Operation                | Endpoint                            | owner | admin | member | viewer |
| ------------------------ | ----------------------------------- | :---: | :---: | :----: | :----: |
| List event log entries   | `GET /api/event-log`                |  ✅   |  ✅   |   ✅   |   ✅   |
| Get event log stats      | `GET /api/event-log/stats`          |  ✅   |  ✅   |   ✅   |   ✅   |
| Toggle entry read status | `PATCH /api/event-log/:id/read`     |  ✅   |  ✅   |   ✅   |   ✅   |
| Mark all as read         | `POST /api/event-log/mark-all-read` |  ✅   |  ✅   |   ✅   |   ✅   |

> Event log read/mark operations are scoped to the user's own read state and don't modify shared data, so all roles are permitted.

#### Unscoped Endpoints (No Integration Role Required)

These endpoints operate on the authenticated user's own identity, not on a specific integration:

| Operation          | Endpoint                       | Requirement        |
| ------------------ | ------------------------------ | ------------------ |
| Auth callback      | `GET /api/auth/callback`       | Public             |
| Token refresh      | `POST /api/auth/refresh`       | Public             |
| Logout             | `GET /api/auth/logout`         | Public             |
| WS token           | `GET /api/auth/ws-token`       | Authenticated      |
| Get current user   | `GET /api/user`                | Authenticated      |
| Accept invitation  | `POST /api/invitations/accept` | Authenticated      |
| Webhook ingest     | `POST /api/import/:id`         | Signature-verified |
| GitHub App webhook | `POST /api/github/webhook`     | Signature-verified |

### Implementation Design

#### 1. Permission Constants

Define a declarative permission map in the shared types package:

```typescript
// packages/db/src/types/permissions.ts

export const ROLE_RANK: Record<MemberRole, number> = {
    owner: 0,
    admin: 1,
    member: 2,
    viewer: 3,
};

export const hasRole = (userRole: MemberRole, requiredRole: MemberRole): boolean => ROLE_RANK[userRole] <= ROLE_RANK[requiredRole];
```

#### 2. Authorization Middleware

A single reusable middleware that resolves the caller's role for the target integration and rejects if insufficient:

```typescript
// apps/api/src/shared/middleware/requireRole.ts

import {ROLE_RANK, type MemberRole} from '@gitgazer/db/types';

export const requireRole = (minimumRole: MemberRole) => {
    return async (app: AppResolver, next: () => Promise<void>) => {
        const integrationId = app.currentEvent.pathParameters?.integrationId;
        const userId = app.appendContext.appContext.userId;

        if (!integrationId) {
            return app.response.status(400).json({message: 'Missing integrationId'});
        }

        const userRole = await getUserRoleForIntegration(userId, integrationId);

        if (!userRole) {
            return app.response.status(403).json({message: 'Not a member of this integration'});
        }

        if (ROLE_RANK[userRole] > ROLE_RANK[minimumRole]) {
            return app.response.status(403).json({message: 'Insufficient permissions'});
        }

        // Attach role to context for downstream controller logic
        app.appendContext.appContext.role = userRole;
        await next();
    };
};
```

#### 3. Route Registration

Apply middleware declaratively at route registration:

```typescript
// Example: apps/api/src/domains/integrations/integrations.routes.ts

router.delete(
    '/api/integrations/:integrationId',
    requireRole('owner'), // ← only owner can delete
    deleteIntegration,
);

router.put(
    '/api/integrations/:integrationId',
    requireRole('admin'), // ← admin+ can rename
    renameIntegration,
);
```

#### 4. Context Enrichment

Extend `addUserIntegrationsToCtx` to also load the user's role per integration (a single query already joins `user_assignments`). Store the role map in `appContext` so `requireRole` and controllers can access it without additional DB calls:

```typescript
appContext.integrationRoles: Map<string, MemberRole>
```

#### 5. Frontend Enforcement

Expose the user's role per integration in the `GET /api/integrations` response. The frontend uses this to:

- Hide/disable buttons the user cannot use (delete integration, invite member, etc.)
- Show appropriate empty states ("You don't have permission to manage members")

This is **UI convenience only** — the backend middleware is the authoritative enforcement layer.

### Migration Path

1. **Phase 1 — Foundation**: Implement `requireRole` middleware + `hasRole` utility + context enrichment. No behavioral changes yet.
2. **Phase 2 — Protect write endpoints**: Add `requireRole('admin')` to integration management, member management, and invitation routes. Add `requireRole('owner')` to delete integration.
3. **Phase 3 — Protect member-level writes**: Add `requireRole('member')` to notification rule CUD operations.
4. **Phase 4 — Frontend**: Surface role in integration list response, conditionally render UI controls.
5. **Phase 5 — Audit**: Add structured log entries (`logger.info('authz', { userId, integrationId, role, action, allowed })`) for every authorization decision.

Each phase is independently deployable and backward-compatible.

## Consequences

### What becomes easier

- **Adding new endpoints** — Declare the minimum role in one line at route registration; no scattered `if` statements.
- **Auditing permissions** — A single permission matrix documents who can do what; `grep requireRole` shows every enforcement point.
- **Onboarding** — New developers understand the authorization model from a single file, not by reading every controller.
- **Frontend consistency** — The role is available in context, so UI can reliably reflect permissions.

### What becomes harder

- **Flexible permissions** — A strict hierarchy means you can't grant "member + invite" without promoting to admin. If fine-grained permissions are needed later, this ADR would be superseded by a permission-based system.
- **Multi-owner scenarios** — This design assumes a single owner. Transferring ownership or having co-owners requires additional work.
- **Cross-integration operations** — Endpoints like `GET /api/notifications` span multiple integrations. The middleware applies per-integration; cross-integration reads must continue using the existing integration-set scoping (no change needed, but it's a boundary to be aware of).

### What doesn't change

- **Authentication flow** — Cognito OAuth + httpOnly cookies remain unchanged.
- **RLS enforcement** — Database-level row security via `withRlsTransaction` continues to provide defense-in-depth.
- **Webhook verification** — Signature-based auth for ingest endpoints is orthogonal to RBAC.
- **Schema** — No database migrations required. The `role` column on `user_assignments` already stores the necessary data.
