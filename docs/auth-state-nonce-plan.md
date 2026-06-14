# Follow-up Plan (Item B): Real OAuth `state` Nonce + Validate-Before-Exchange

> **Parent decision:** [`auth-hardening-decisions.md`](./auth-hardening-decisions.md) §B.
> **Status:** Proposed — requires human + Security Engineer review before implementation.
> **Risk:** HIGH (login path, spans frontend + backend). **Effort:** M.

## Status

Proposed (human-review gated)

## Context

[`GET /api/auth/callback`](../apps/api/src/domains/auth/auth.routes.ts) treats the OAuth
`state` parameter as a transport for `{ redirect_url }` only. It is set by the frontend as
`btoa(JSON.stringify({redirect_url}))`
([`useAuth.ts:135-136`](../apps/web/src/composables/useAuth.ts)) and is **never compared to
a server-bound value**, so it provides **no CSRF protection** (OWASP A01 login-CSRF, A04).
Additionally, `exchangeCodeForTokens(code)` runs **before** `state` is decoded/validated
(`auth.routes.ts:30-34`), so a forged/garbage `state` still triggers a token exchange.

Severity: Medium (Cognito sits in the middle of the user-facing leg, reducing exposure).

## Decision / approach

Introduce a **signed, unguessable state nonce** (signed cookie — stateless, fits the
serverless model) and **validate `state` before exchanging the code**:

1. **At sign-in** (`useAuth.signIn`): generate a cryptographically random nonce, include it
   in `state` alongside `redirect_url`, and have the server set a short-lived, httpOnly,
   `SameSite` signed cookie binding that nonce (or have the server mint both). The exact
   split (client-generated vs server-minted) is decided with the Security Engineer; a
   server-minted nonce is preferred because the browser cannot forge the signature.
2. **At callback**: decode and verify `state` **first** — confirm the nonce matches the
   signed cookie and is unexpired — and **only then** call `exchangeCodeForTokens(code)`.
   Reject mismatches with `400`/`403` before any upstream exchange.
3. Continue to run `redirect_url` through `validateRedirectUrl` (item C stays closed).
4. Clear the state cookie after a successful callback.

## Steps

1. Backend: add a helper to mint + verify a signed state nonce (reuse the HMAC pattern from
   [`generateWsToken`](../apps/api/src/domains/auth/auth.controller.ts) and `wsTokenSecret`,
   or a dedicated `stateSecret`). Set/clear the cookie via the existing
   [`cookies`](../apps/api/src/shared/helpers/cookies.ts) helpers.
2. Backend: in `auth.routes.ts` callback, **reorder** so `state` (+ nonce) is verified
   before `exchangeCodeForTokens`.
3. Backend: add a sign-in initiation endpoint (or extend the existing flow) that sets the
   state cookie, if a server-minted nonce is chosen.
4. Frontend: update `useAuth.signIn` to obtain/round-trip the nonce through Cognito's
   `state`, keeping `redirect_url` semantics intact.
5. Verify the nonce survives the Cognito round-trip (Cognito relays `state` back unchanged).

## Tests

- Unit (Vitest): callback with a valid nonce → exchange proceeds; missing/forged/expired
  nonce → `400`/`403` and **no** call to `exchangeCodeForTokens`.
- Unit: `redirect_url` still validated via `validateRedirectUrl`; invalid origin rejected.
- Frontend: `signIn` includes the nonce and `redirect_url` in `state`.
- Regression: full Cognito login still succeeds in staging.

## Security-review gate

- [ ] Security Engineer agent reviews the nonce design (signing, expiry, cookie attributes,
      client- vs server-minted).
- [ ] Human approves the coordinated frontend + backend change before merge.
- [ ] Staging login verified before production rollout.

## STOP conditions

- If Cognito does **not** relay `state` back unchanged in this deployment — STOP; the
  cookie-bound nonce approach must be re-validated against the actual Hosted-UI behavior.
- If introducing the cookie breaks the existing cross-site cookie/`SameSite` setup for the
  callback — STOP and align cookie attributes with the current auth cookies first.
