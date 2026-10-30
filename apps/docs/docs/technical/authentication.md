---
sidebar_position: 2
title: Authentication & Authorization
description: OAuth flow, token lifecycle, middleware chain, RBAC, and WebSocket authentication.
---

# Authentication & Authorization

GitGazer uses AWS Cognito with GitHub as an OIDC identity provider. Users sign in with their GitHub account, receive session tokens stored in httpOnly cookies, and are authorized based on their role within each integration.

## Authentication Flow

```mermaid
sequenceDiagram
    participant User as User (Browser)
    participant SPA as Vue SPA
    participant Cognito as Cognito Hosted UI
    participant GitHub as GitHub OAuth
    participant API as api Lambda
    participant DB as Aurora PostgreSQL

    User->>SPA: Click "Sign in with GitHub"
    SPA->>API: Redirect to GET /api/auth/login?redirect_url=...
    API->>API: Validate redirect_url, mint signed state token + nonce
    API->>User: 302 to Cognito /oauth2/authorize (state) + Set-Cookie nonce
    User->>Cognito: Follow redirect
    Cognito->>GitHub: Redirect to GitHub login
    GitHub->>User: Prompt for authorization
    User->>GitHub: Approve
    GitHub->>Cognito: Authorization code
    Cognito->>API: Redirect to /api/auth/callback?code=...&state=...
    API->>API: Verify state signature + nonce cookie (before code exchange)
    API->>Cognito: Exchange code for tokens (token endpoint)
    Cognito-->>API: Access token, ID token, refresh token
    API->>API: Set httpOnly cookies (accessToken, idToken, refreshToken)
    API->>User: 302 Redirect to SPA (with cookies)
    User->>SPA: Load app
    SPA->>API: GET /api/user (cookies sent automatically)
    API->>API: Verify JWT tokens via aws-jwt-verify
    API->>DB: Upsert user (cognitoId, email, name, githubId, githubLogin)
    DB-->>API: User record
    API-->>SPA: User attributes
```

### How It Works

1. The SPA redirects the browser to `GET /api/auth/login?redirect_url=<app-origin>`. Sign-in is initiated **server-side** — the SPA no longer builds the Cognito authorize URL itself.
2. The login endpoint validates the `redirect_url`, mints a **signed, single-use `state` token** bound to a random **nonce**, stores the nonce in a short-lived httpOnly cookie (`oauthStateNonce`, 10-minute TTL), and 302-redirects to Cognito's `/oauth2/authorize` with the signed token in the `state` parameter.
3. Cognito redirects to GitHub for OAuth consent.
4. After approval, Cognito receives an authorization code and redirects to `GET /api/auth/callback?code=...&state=...`.
5. The callback handler **verifies the signed `state` token and nonce cookie before anything else** — checking the HMAC signature, the expiry, and that the nonce embedded in the token matches the nonce cookie. If any check fails it returns HTTP 403 and **never exchanges the code**.
6. Only after the state is verified does the handler exchange the code for tokens via Cognito's token endpoint.
7. Tokens are set as **httpOnly, Secure, SameSite=Lax** cookies, the state cookie is cleared, and the user is redirected back to the validated app URL. All subsequent API requests include cookies automatically.

### OAuth State Binding (Login-CSRF Protection)

The `state` parameter is not just an opaque redirect hint — it is a signed token that protects against login cross-site request forgery (an attacker tricking a victim into completing a login the attacker started).

- **Signed payload** — the token is `base64url(payload).hmacSHA256(payload)`, where the payload carries the `redirect_url`, a random `nonce`, and an `exp` timestamp. It is signed with a dedicated `stateSecret`.
- **Nonce binding** — the same nonce is stored in the httpOnly `oauthStateNonce` cookie. The callback only succeeds if the nonce inside the signed token matches the nonce in the cookie, so a `state` value cannot be replayed in another browser.
- **Constant-time checks** — the signature and nonce are compared in constant time (both sides are SHA-256 hashed first) so neither length nor content leaks through timing.
- **Fail closed** — if `stateSecret` is not configured, login initiation and callback both fail loudly rather than silently accepting forgeable tokens.
- **Short-lived & single-use** — the token expires after 10 minutes (matching the cookie `Max-Age`), and the nonce cookie is cleared once the callback completes.

### Slack Callbacks

The Slack app adds two redirect routes that Slack calls through the user's browser: `/api/slack/oauth/callback` (install) and `/api/slack/sign-in/callback` (Connect Slack). Unlike the Cognito callback, they are **not** public routes. They go through the normal `authenticate` middleware, so the user's session cookies must be present.

- **Signed state with purpose** — the state token reuses the signed-state mechanism above and additionally carries a `purpose` (`slack_install` or `slack_sign_in`), the integration ID, and the user ID. A callback rejects a token whose purpose or user ID doesn't match.
- **Nonce cookie** — the nonce is bound to the browser through the same `oauthStateNonce` cookie and cleared after the callback.
- **Fixed redirect URIs** — the redirect URIs are fixed API routes, never taken from the request.

### GitHub Email Scope

The GitHub OAuth app requests the `user:email` scope. At login, the user attribute endpoint reads the user's verified emails from GitHub and looks them up in the Slack workspaces of the user's integrations, to link the GitHub account to a Slack user. The step has a short time limit and never blocks or fails the login. Email addresses are only held in memory during the lookup and are never stored or logged; only the resulting Slack user ID is kept.

### GitHub Identity Mapping

Cognito maps GitHub profile attributes to user pool claims:

| GitHub Attribute | Cognito Claim      | Purpose                                    |
| ---------------- | ------------------ | ------------------------------------------ |
| `email`          | `email`            | User email address                         |
| `name`           | `name`             | Display name                               |
| `sub`            | `username`         | Unique GitHub user identifier              |
| `avatar_url`     | `picture`          | Profile picture                            |
| `login`          | `nickname`         | GitHub username                            |
| `id`             | `custom:github_id` | Numeric GitHub user ID (used for org sync) |

## Token Lifecycle

GitGazer manages three tokens, all stored as httpOnly cookies:

| Token             | Purpose                                                        | Lifetime |
| ----------------- | -------------------------------------------------------------- | -------- |
| **Access token**  | Authorizes API requests. Verified on every request.            | 1 hour   |
| **ID token**      | Contains user identity claims (email, name, github_id).        | 1 hour   |
| **Refresh token** | Used to obtain new access/ID tokens without re-authentication. | 7 days   |

### Silent Refresh

When the access token expires, the SPA's `fetchWithAuth` helper automatically retries:

1. An API request returns HTTP 401.
2. `fetchWithAuth` calls `POST /api/auth/refresh` with the refresh token cookie.
3. The API exchanges the refresh token for new access/ID tokens via Cognito.
4. New cookies are set on the response.
5. The original request is retried with the fresh tokens.

This is transparent to the user — there is no visible re-authentication.

## Middleware Chain

Every API request passes through a global middleware chain in this order:

```
compress → cors → authenticate → originCheck → authorize → route handler
```

### 1. Compress

Applies gzip compression to responses.

### 2. CORS

Validates the `Origin` header against a configured allowlist and sets CORS response headers.

### 3. Authenticate

The core authentication middleware:

1. Checks if the route is in the **public route bypass** list. If so, skips authentication.
2. Extracts `accessToken`, `idToken`, and `refreshToken` from cookies.
3. Verifies both the access token and ID token using `aws-jwt-verify` against the Cognito user pool.
4. **Upserts the user** into `gitgazer.users` using claims from the ID token (cognitoId, email, name, picture, githubId, githubLogin).
5. If the user has a `github_id`, resolves any **pending org sync** entries — automatically adding the user to integrations where their GitHub org membership was synced before they first logged in.
6. Attaches user context (`userId`, `username`, `email`, etc.) to the request.

### 4. Origin Check (CSRF Protection)

For state-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) on non-public routes:

- Checks the `Origin` header against a configured allowlist.
- Rejects requests with an unrecognized origin with HTTP 403.
- Allows requests without an `Origin` header (server-to-server calls where cookies aren't attached).
- Public routes (webhooks, auth callbacks) are exempt because they use their own authentication (HMAC signatures, authorization codes).

## Public Route Bypass

These route prefixes skip authentication because they have their own verification:

| Prefix                                                                                         | Reason                                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/api/auth/login`                                                                              | Sign-in start — no session yet, mints the signed `state`                       |
| `/api/auth/callback`                                                                           | OAuth callback — no cookies yet, uses authorization code                       |
| `/api/auth/refresh`                                                                            | Token refresh — uses refresh token cookie directly                             |
| `/api/auth/cognito/`                                                                           | Cognito OIDC helper endpoints (token proxy, user info proxy)                   |
| `/api/import/`                                                                                 | Integration webhooks — verified via HMAC signature (`X-Hub-Signature-256`)     |
| `/api/github/`                                                                                 | GitHub App webhooks — verified via app-level HMAC signature                    |
| `/api/mcp`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` | MCP endpoint and OAuth proxy — Bearer token, see [MCP Server](./mcp-server.md) |
| `/fe-failover/`                                                                                | Serves the web app's `index.html` as a fallback                                |

Each domain declares its own `publicPrefixes` export, which are aggregated into a central registry.

### Cognito OAuth Token Relay

The `/api/auth/cognito/` prefix backs a relay that Cognito itself calls to complete the GitHub identity-provider exchange. Because Cognito is the caller, these routes cannot sit behind the normal Cognito authorizer — so they enforce their own checks:

- **Caller authentication** — `POST /api/auth/cognito/token` authenticates its caller against the GitHub OAuth app credentials (`client_id` / `client_secret`) using constant-time comparison. An attacker holding only an intercepted authorization `code` cannot drive the exchange without also holding the OAuth app secret.
- **Server-held credentials only** — the upstream exchange with GitHub always uses the server-configured OAuth app credentials. Caller-supplied client secrets are used solely to authenticate the caller and are **never forwarded** to GitHub.
- **No upstream error reflection** — invalid, expired, or already-used codes surface as a generic HTTP 400, and upstream error text is logged server-side only, never returned to the caller.
- **Fail closed** — if the GitHub OAuth app credentials are not configured, the endpoint returns a server error instead of authenticating a caller with empty credentials.

## Role-Based Access Control (RBAC)

### Role Hierarchy

Every user's membership in an integration has a role. Roles form a strict linear hierarchy where higher roles inherit all permissions of lower roles:

```
owner > admin > member > viewer
```

| Role       | Description                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------- |
| **owner**  | Full control, including deleting the integration and managing owners and admins.               |
| **admin**  | Manages members, invitations, apps, handles and the GitHub App; cannot touch owners or admins. |
| **member** | Day-to-day use: creates and edits notification rules, sees pending invitations.                |
| **viewer** | Read-only access to the integration's data.                                                    |

An integration can have several owners. The full permission matrix, the extra rules for managing owners and admins, and the database roles behind them are in [Roles & Permissions](./roles-and-permissions.md).

### `authorize` Middleware

One permission table, `apps/lambdas/api/src/shared/permissions/table.ts`, maps every route to an operation and every operation to an access level (`public`, `authenticated` or a minimum role). The `authorize` middleware runs after `originCheck` and, for the matched route:

1. Answers HTTP 403 if the route has no table entry, so a new route is closed until it is added. An unknown path still gets 404.
2. Lets `public` and `authenticated` routes through.
3. For a minimum role, reads the path segment at the pattern's `:integrationId` position and looks up the user's role for that integration, loading the user's roles only when needed.
4. Compares the role against the minimum using the hierarchy and returns HTTP 403 if the user is not a member or the role is insufficient.

Routes without an `integrationId` in the path (workflows, overview, metrics, event log, the notification list) are `authenticated` and act on all the caller's integrations; row-level security limits the queries to them. A test in CI fails if a route or MCP tool has no table entry, or an entry has no route.

## WebSocket Authentication

WebSocket connections use a signed token instead of cookies (API Gateway WebSocket doesn't forward cookies on `$connect`):

1. The SPA calls `GET /api/auth/ws-token` (authenticated via cookies).
2. The API generates a short-lived (60-second) HMAC-signed token containing `userId`, `integrations`, a random `nonce`, and an expiry timestamp.
3. The SPA connects to the WebSocket API with `?token=<signed-token>&channel=workflows`.
4. The WebSocket Lambda validates the HMAC signature using a **constant-time comparison** (with a length check, since `timingSafeEqual` requires equal-length buffers), checks expiry, and stores one connection record per integration in `gitgazer.ws_connections`.
5. On `$disconnect`, the Lambda removes the connection records.

This ensures WebSocket access is scoped to the same integrations the user has access to via the REST API.
