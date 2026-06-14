# ADR: Auth Hardening — Human-Led Security Decisions (Plan 019)

## Status

Accepted (decisions recorded) — remediation tracked in linked follow-up plans

> **Scope of this document.** This is a **decision record only**. Per Plan 019, no
> authentication route/controller/middleware was modified by this change. Each accepted
> remediation is specified in a separate, human-approved follow-up plan with a
> security-review gate (see [Follow-up plans](#follow-up-plans)). Investigation was
> performed against commit `4c6bb4aa` (2026-06-14).

## Context

An audit (finding #18) surfaced three authentication items that require a **security
decision** rather than a quick patch, plus one item that was checked and found **already
safe**. Authentication is the highest-blast-radius surface in GitGazer, so the changes are
human-led: this document captures **what** the decision is and **why**, and defers the
**how** to follow-up implementation plans that ship behind human review.

### How the auth flow actually works (evidence)

Understanding the topology is a prerequisite for the decisions below. Two distinct OAuth
legs exist:

1. **User ↔ Cognito Hosted UI (the primary login path).**
   The frontend [`signIn`](../apps/web/src/composables/useAuth.ts) sends the browser to the
   Cognito Hosted UI (`oauth2/authorize`, `response_type=code`). Cognito redirects back to
   [`GET /api/auth/callback`](../apps/api/src/domains/auth/auth.routes.ts), which exchanges
   the code for Cognito tokens via
   [`exchangeCodeForTokens`](../apps/api/src/domains/auth/auth.controller.ts) and sets
   httpOnly cookies. This leg uses the **Cognito client secret server-side** (Basic auth
   header) and never exposes it to the browser.

2. **Cognito ↔ GitHub (server-to-server OIDC shim).**
   GitHub is not a spec-compliant OIDC provider, so the deployment federates Cognito to
   GitHub using a **custom OIDC shim**. In [`infra/cognito.tf`](../infra/cognito.tf) the
   GitHub identity provider is configured with:

   ```hcl
   token_url      = "${api_endpoint}/api/auth/cognito/token"
   attributes_url = "${api_endpoint}/api/auth/cognito/user"
   jwks_uri       = "${api_endpoint}/api/auth/cognito/token"
   ```

   So **Cognito itself** (not the browser) calls `/api/auth/cognito/token` with the GitHub
   OAuth app `client_id` + `client_secret` (from `provider_details.client_secret`) + `code`
   to exchange the GitHub authorization code, then calls `/api/auth/cognito/user` with the
   resulting GitHub access token to read the profile.

### Usage determination (Done-criteria evidence)

| Endpoint                     | Status   | Evidence                                                                                                                             |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/cognito/token` | **LIVE** | Wired as the GitHub IdP `token_url`/`jwks_uri` in [`infra/cognito.tf:28,30`](../infra/cognito.tf). Removing it breaks login.         |
| `GET /api/auth/cognito/user`   | **LIVE** | Wired as the GitHub IdP `attributes_url` in [`infra/cognito.tf:29`](../infra/cognito.tf). Removing it breaks profile attribute sync. |

The frontend ([`useAuth.ts`](../apps/web/src/composables/useAuth.ts)) does **not** call
either endpoint directly — they are invoked **server-to-server by Cognito**. Neither is a
legacy/dead path; both are required for the current GitHub federation.

> **STOP-condition note.** Plan 019 states: _"The relay is found to be actively used by
> production clients → escalate before speccing removal."_ This condition is **met**.
> Therefore the decision for item A is **harden, not remove**, and any change must be
> coordinated with the Cognito IdP configuration in `infra/`.

## Decisions

### A. Public OAuth token relay accepts `client_secret` from the request body

| Attribute    | Value                                                                       |
| ------------ | --------------------------------------------------------------------------- |
| OWASP        | A04 Insecure Design, A07 Identification & Auth Failures, A10-adjacent (SSRF) |
| Severity     | Medium                                                                       |
| Decision     | **Harden in place — do NOT remove** (endpoint is LIVE; see usage table)      |

**Threat model.** `POST /api/auth/cognito/token` and `GET /api/auth/cognito/user` are
unauthenticated, public endpoints (`publicPrefixes` includes `/api/auth/cognito/` in
[`auth.routes.ts`](../apps/api/src/domains/auth/auth.routes.ts)). As written they are an
**open relay/proxy** to GitHub's token and user APIs:

- `exchangeGitHubOAuthToken` forwards an **arbitrary caller-supplied** `client_id` /
  `client_secret` / `code` to `https://github.com/login/oauth/access_token`
  ([`users.controller.ts`](../apps/api/src/domains/users/users.controller.ts)). Any caller
  can drive a code exchange with their own GitHub OAuth credentials.
- `fetchGitHubUser` forwards an **arbitrary caller-supplied** `authorization` header to
  `https://api.github.com/user`, i.e. an open proxy to the GitHub user API.

The original concern ("a client secret in the body implies client-side handling") is
**partially mitigated**: in the real flow the secret is the GitHub OAuth app secret held by
**Cognito** and sent **server-to-server**, never by the browser. The residual risk is the
**open-relay / abuse / request-forgery** surface (unauthenticated proxy to a fixed external
host), plus reflected upstream error text.

**Decision.** Keep the endpoints (login depends on them) but **constrain the proxy**:

1. **Pin the credentials server-side.** Validate the incoming `client_id`/`client_secret`
   against the values held in config / Secrets Manager (the same GitHub OAuth app the IdP
   uses) and reject anything else, rather than blindly forwarding caller-supplied secrets.
   This converts the open relay into a closed exchange usable only for the legitimate IdP.
2. **Constrain the user proxy.** `GET /api/auth/cognito/user` should only ever be reached
   as part of the IdP flow; it must not become a general GitHub-API proxy. The upstream host
   is already fixed (`api.github.com/user`), which bounds SSRF, but abuse/rate concerns
   remain.
3. **Add rate limiting / origin constraints** at the edge (API Gateway / WAF) for the
   `/api/auth/cognito/*` prefix.
4. **Do not reflect upstream error bodies** verbatim to the caller.

Implementation is specified in
[`auth-oauth-relay-hardening-plan.md`](./auth-oauth-relay-hardening-plan.md) (human-review
gated). Because the change is coupled to the Cognito IdP config, it must ship with a
coordinated `infra/` review.

### B. OAuth `state` is not a CSRF nonce; code is exchanged before state is validated

| Attribute    | Value                                                                |
| ------------ | -------------------------------------------------------------------- |
| OWASP        | A01 Broken Access Control (login-CSRF), A04 Insecure Design           |
| Severity     | Medium                                                                |
| Decision     | **Remediate** — introduce a real state nonce and reorder validation   |

**Threat model.** In
[`GET /api/auth/callback`](../apps/api/src/domains/auth/auth.routes.ts) the `state`
parameter carries only `{ redirect_url }` (set by the frontend as
`btoa(JSON.stringify({redirect_url}))` in
[`useAuth.ts:135-136`](../apps/web/src/composables/useAuth.ts)). It is **never compared to a
server-bound value**, so it provides **no CSRF protection** — a proper OAuth `state` is an
unguessable nonce minted at sign-in and verified on callback to prevent **login CSRF**.
Additionally, `exchangeCodeForTokens(code)` runs **before** `state` is decoded/validated
([`auth.routes.ts:30-34`](../apps/api/src/domains/auth/auth.routes.ts)), so a
forged/garbage `state` still triggers a token exchange.

Cognito sits in the middle of the user-facing leg, which reduces but does not eliminate the
login-CSRF exposure, hence Medium (not High).

**Decision.** Remediate:

1. **Mint a signed, unguessable state nonce at sign-in** (signed cookie preferred — it is
   stateless and fits the serverless model — over server-stored state). The nonce is set in
   `useAuth.signIn` and verified in the callback.
2. **Validate/parse `state` _before_ exchanging the code**, so a forged `state` is rejected
   without an upstream token exchange.
3. Keep `redirect_url` inside the (now signed) state and continue to run it through
   `validateRedirectUrl` (see item C).

This spans frontend + backend. Implementation is specified in
[`auth-state-nonce-plan.md`](./auth-state-nonce-plan.md) (human-review gated).

### C. Open-redirect — already mitigated; do NOT re-open

| Attribute    | Value                                                            |
| ------------ | --------------------------------------------------------------- |
| OWASP        | A01 Broken Access Control (open redirect)                        |
| Severity     | N/A — closed                                                     |
| Decision     | **Confirmed closed** (with a deploy-config caveat)               |

[`validateRedirectUrl`](../apps/api/src/domains/auth/auth.helpers.ts) is called on the
callback (`auth.routes.ts:40-43`) and on logout (`auth.routes.ts:106-109`); the redirect is
rejected when the URL is not allowed, and the `Location` header uses the **validated** URL.
The helper checks the URL's origin against
[`allowedFrontendOrigins`](../apps/api/src/shared/config.ts) (config). This item is
**closed**.

> **Deploy-config caveat (STOP condition).** `allowedFrontendOrigins` **defaults to an empty
> array**. If a deployed environment leaves it empty/misconfigured, `validateRedirectUrl`
> rejects every redirect (login/logout break) — it does **not** silently allow open
> redirects, so this is fail-closed. Operators must still ensure the allow-list is populated
> per environment. **Verify `ALLOWED_FRONTEND_ORIGINS` is non-empty in every deployed
> environment.** If any deployed environment is found with an empty list, escalate as a
> separate config finding.

### D. Verbose auth logging — low severity, confirmed safe

| Attribute    | Value                                              |
| ------------ | -------------------------------------------------- |
| OWASP        | A09 Security Logging & Monitoring (informational)  |
| Severity     | Low / informational                                |
| Decision     | **No action required** (optional cleanup)          |

Reviewed log statements:

- [`auth.routes.ts`](../apps/api/src/domains/auth/auth.routes.ts): logs `{state}` at debug
  (line 28) and `{frontendUrl}` at info (lines 45-47). `state` here is non-sensitive — it is
  a base64-encoded `{redirect_url}`, not a token or secret.
- [`auth.controller.ts`](../apps/api/src/domains/auth/auth.controller.ts): logs upstream
  provider `errorText` on exchange/refresh failure (lines 42-44, 80-83).
- [`users.controller.ts`](../apps/api/src/domains/users/users.controller.ts): no logging of
  the relayed secret/token.

**No tokens, secrets, or cookies are logged.** Recorded as informational. Optional, low
priority: avoid logging upstream `errorText` verbatim if it could ever echo sensitive
request context (it currently does not). No follow-up plan is required for D.

## Consequences

- **Easier:** The auth surface now has a documented threat model, an explicit live/legacy
  determination for the relay endpoints, and OWASP/severity-mapped decisions an executor can
  act on without re-deriving context.
- **Harder / coordinated:** Item A's remediation is coupled to the Cognito GitHub IdP
  configuration in `infra/`; it cannot be changed in the API alone. Item B's remediation
  spans frontend + backend and must preserve the Cognito round-trip of `state`.
- **Unchanged here:** No auth route/controller/middleware or Cognito/infra configuration was
  modified by this plan. Remediation lands in the linked, human-approved follow-up plans.

## Follow-up plans

| Item | Decision        | Follow-up plan                                                            | Review gate     |
| ---- | --------------- | ------------------------------------------------------------------------- | --------------- |
| A    | Harden in place | [`auth-oauth-relay-hardening-plan.md`](./auth-oauth-relay-hardening-plan.md) | Human + Security |
| B    | Remediate       | [`auth-state-nonce-plan.md`](./auth-state-nonce-plan.md)                   | Human + Security |
| C    | Closed          | — (verify deploy config only)                                             | —               |
| D    | No action       | — (optional cleanup, low priority)                                        | —               |
