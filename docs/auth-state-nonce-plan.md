# Follow-up Plan (Item B): Real OAuth `state` Nonce + Validate-Before-Exchange

> **Parent decision:** [`auth-hardening-decisions.md`](./auth-hardening-decisions.md) §B.
> **Status:** Proposed — requires human + Security Engineer review before implementation.
> **Risk:** HIGH (login path, spans frontend + backend). **Effort:** M.
>
> **Executor instructions:** Follow this plan step by step. Run every verification command
> and confirm the expected result before moving on. If anything in "STOP conditions" occurs,
> stop and report — do not improvise.
>
> **Drift check (run first):**
> `git diff --stat 4c6bb4aa..HEAD -- apps/api/src/domains/auth/auth.routes.ts apps/api/src/domains/auth/auth.controller.ts apps/web/src/composables/useAuth.ts apps/api/src/shared/helpers/cookies.ts`
> This plan was written against commit `4c6bb4aa`. If any in-scope file changed since then,
> compare the "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority:** P1
- **Effort:** M
- **Risk:** HIGH (login path, spans frontend + backend)
- **Depends on:** none (independent of item A)
- **Category:** security
- **Review gate:** Human + Security Engineer (mandatory before merge)
- **Planned at:** commit `4c6bb4aa`, 2026-06-14

## Why this matters

[`GET /api/auth/callback`](../apps/api/src/domains/auth/auth.routes.ts) treats the OAuth
`state` parameter as a transport for `{ redirect_url }` only. It is set by the frontend as
`btoa(JSON.stringify({redirect_url}))`
([`useAuth.ts:135-136`](../apps/web/src/composables/useAuth.ts)) and is **never compared to a
server-bound value**, so it provides **no CSRF protection** (OWASP A01 login-CSRF, A04).
Additionally, `exchangeCodeForTokens(code)` runs **before** `state` is decoded/validated, so
a forged/garbage `state` still triggers an upstream token exchange. Severity: Medium (Cognito
sits in the middle of the user-facing leg, reducing exposure). After this lands, a forged
callback is rejected before any token exchange, and `state` carries an unforgeable nonce.

## Design decision (committed — not deferred)

Use a **server-minted, HMAC-signed nonce bound in a short-lived httpOnly cookie.** This is
the only option the browser cannot forge, and it fits the serverless model (stateless — no
server-side session store). The client-generated alternative is **rejected**: a value the
browser mints provides no integrity guarantee.

> **Consequence the executor must internalize.** Today `signIn` builds the Cognito Hosted-UI
> URL **entirely client-side** and navigates straight to Cognito
> ([`useAuth.ts:129-143`](../apps/web/src/composables/useAuth.ts)). A server-set httpOnly
> cookie **cannot** be created by client JS. Therefore sign-in must first hit a **new backend
> initiation endpoint** that (a) mints the nonce, (b) sets the signed httpOnly cookie, and
> (c) 302-redirects the browser to the Cognito Hosted-UI URL with `state` containing the
> nonce + `redirect_url`. This redirect-through-the-backend is the central structural change
> of this plan, not a detail.

## Current state

- **Callback handler** — [`apps/api/src/domains/auth/auth.routes.ts:27-33`](../apps/api/src/domains/auth/auth.routes.ts).
  Exchange happens at line 29, **before** state is decoded at lines 31–33:

    ```ts
    logger.debug('Exchanging authorization code for tokens', {state});
    const {cookies} = await exchangeCodeForTokens(code); // ← exchange FIRST (line 29)
    // Decode state parameter (base64-encoded JSON)
    const decodedState = Buffer.from(state, 'base64').toString('utf-8');
    const stateData = JSON.parse(decodedState) as State; // ← validate AFTER (lines 31-33)
    ```

    Target ordering: decode + verify nonce against the signed cookie → reject on mismatch →
    **only then** `await exchangeCodeForTokens(code)`.

- **Sign-in (frontend)** — [`apps/web/src/composables/useAuth.ts:129-143`](../apps/web/src/composables/useAuth.ts).
  Builds the Cognito URL and sets `state: btoa(JSON.stringify({redirect_url}))`, then
  navigates. Must change to call the new backend initiation endpoint instead.

- **HMAC pattern to reuse** — [`apps/api/src/domains/auth/auth.controller.ts:97-111`](../apps/api/src/domains/auth/auth.controller.ts)
  (`generateWsToken`): `createHmac('sha256', secret).update(payload).digest('base64url')`
  with `randomBytes(16)` for the nonce and an `exp` field. Mirror this for the state token.

- **Secret** — add a dedicated `stateSecret` to
  [`config.ts`](../apps/api/src/shared/config.ts) (match the `wsTokenSecret:118-123` shape,
  `sensitive: true`). Do **not** reuse `wsTokenSecret` for an unrelated purpose.

- **Cookie helpers + attributes** — [`apps/api/src/shared/helpers/cookies.ts:5`](../apps/api/src/shared/helpers/cookies.ts):
  `COOKIE_OPTIONS = 'Secure; HttpOnly; SameSite=Lax; Path=/'`. **`SameSite=Lax` is correct
  here:** the callback is a **top-level GET navigation** from Cognito, which `Lax` permits, so
  the nonce cookie **will** be sent back. Reuse this attribute string for the state cookie
  (add a short `Max-Age`, e.g. 600s). Verify, don't worry — see Step 5.

## Commands you will need

| Purpose            | Command                               | Expected on success |
| ------------------ | ------------------------------------- | ------------------- |
| Backend unit tests | `pnpm run test:unit` (in `apps/api/`) | all pass, exit 0    |
| Backend lint       | `pnpm run lint` (in `apps/api/`)      | exit 0              |
| Frontend typecheck | `vue-tsc --noEmit` (in `apps/web/`)   | exit 0              |

## Scope

**In scope:**

- `apps/api/src/shared/config.ts` — add `stateSecret`.
- `apps/api/src/domains/auth/auth.controller.ts` — add `mintStateToken` / `verifyStateToken`.
- `apps/api/src/domains/auth/auth.routes.ts` — new initiation route; reorder the callback.
- `apps/api/src/shared/helpers/cookies.ts` — add a `buildStateCookie` / clear helper.
- `apps/web/src/composables/useAuth.ts` — `signIn` calls the backend initiation endpoint.
- Corresponding `*.test.ts` files (create as needed).

**Out of scope:**

- `validateRedirectUrl` and `auth.helpers.ts` — item C is closed; keep calling it, do not change it.
- The relay endpoints (`users.*`) — that is item A.
- Token/refresh cookie logic in `cookies.ts` (`buildAuthCookies`, `buildClearCookies`) — do
  not alter existing auth cookies' attributes or lifetimes.

## Git workflow

- Branch: `advisor/auth-state-nonce`. Conventional-commit messages (see `git log`). Do NOT
  push or open a PR unless the operator instructs.

## Steps

### Step 1: Add `stateSecret` to config

Add a `stateSecret` entry to [`config.ts`](../apps/api/src/shared/config.ts) matching the
`wsTokenSecret` shape (`format: String`, `default: ''`, `env: 'STATE_SECRET'`,
`sensitive: true`).

**Verify:** `pnpm run lint` (in `apps/api/`) → exit 0.

### Step 2: Add mint/verify helpers (backend)

In [`auth.controller.ts`](../apps/api/src/domains/auth/auth.controller.ts), add
`mintStateToken({redirect_url})` and `verifyStateToken(token, nonceFromCookie)` mirroring the
`generateWsToken` HMAC pattern: payload `{redirect_url, nonce: randomBytes(16).toString('hex'), exp}`,
signed with `config.get('stateSecret')`. `verifyStateToken` recomputes the signature
(constant-time compare), checks `exp`, and checks the embedded `nonce` equals the cookie nonce.

**Verify:** `pnpm run test:unit` → Step 6 helper tests pass.

### Step 3: Add the sign-in initiation endpoint (backend)

Add `GET /api/auth/login` (public prefix) to
[`auth.routes.ts`](../apps/api/src/domains/auth/auth.routes.ts): read `redirect_url` from the
query, run it through `validateRedirectUrl` (reject if invalid), mint the state token + nonce,
set the signed httpOnly state cookie (Step 5 helper), and 302-redirect to the Cognito
Hosted-UI `authorize` URL with `state` = the minted token. Add `/api/auth/login` to the
exported `publicPrefixes` if needed.

**Verify:** `pnpm run test:unit` → the initiation-route test passes.

### Step 4: Reorder the callback — verify before exchange (backend)

In the `GET /api/auth/callback` handler, **decode `state`, read the nonce cookie, and call
`verifyStateToken` FIRST.** Reject mismatch/expiry with `400`/`403` **before** calling
`exchangeCodeForTokens(code)`. Keep running `redirect_url` through `validateRedirectUrl`.
Clear the state cookie on success.

**Verify:** `pnpm run test:unit` → the callback ordering test (Step 6) passes — asserting
`exchangeCodeForTokens` is **not** called on a forged/missing nonce.

### Step 5: State cookie helpers (backend)

Add `buildStateCookie(token)` and a clear variant to
[`cookies.ts`](../apps/api/src/shared/helpers/cookies.ts), reusing `COOKIE_OPTIONS`
(`Secure; HttpOnly; SameSite=Lax; Path=/`) plus a short `Max-Age` (e.g. 600). Do not modify
the existing auth-cookie helpers.

**Verify:** `pnpm run test:unit` → cookie helper test passes.

### Step 6: Update `signIn` (frontend)

Change [`useAuth.ts`](../apps/web/src/composables/useAuth.ts) `signIn` to navigate the browser
to the backend `GET /api/auth/login?redirect_url=…` endpoint (which sets the cookie and
redirects to Cognito) instead of building the Cognito URL client-side. Preserve the existing
`redirect_url` semantics.

**Verify:** `vue-tsc --noEmit` (in `apps/web/`) → exit 0.

## Test plan

Backend (Vitest, mock upstream/`exchangeCodeForTokens`):

- `verifyStateToken`: valid token+nonce → ok; tampered signature, wrong nonce, expired → fail.
- Callback: valid nonce → `exchangeCodeForTokens` called once, redirect issued; missing /
  forged / expired nonce → `400`/`403` and `exchangeCodeForTokens` **not called** (assert the mock).
- `redirect_url` still validated via `validateRedirectUrl`; invalid origin rejected.
- Initiation route: sets a state cookie and 302s to Cognito with a non-empty `state`.

Frontend: `signIn` navigates to the backend initiation endpoint with `redirect_url`.

Model new backend tests after an existing `apps/api/src/domains/**/**.test.ts`.

**Verify:** `pnpm run test:unit` (api) all pass; `vue-tsc --noEmit` (web) exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run test:unit` (api) exits 0; new state-nonce tests exist and pass.
- [ ] `pnpm run lint` (api) exits 0; `vue-tsc --noEmit` (web) exits 0.
- [ ] A test asserts `exchangeCodeForTokens` is **not** called when the nonce is missing/forged/expired.
- [ ] `grep -n "btoa(JSON.stringify" apps/web/src/composables/useAuth.ts` returns no match
      (client no longer builds the Cognito URL / `state` directly).
- [ ] `git status` shows only in-scope files modified.

## Security-review gate

- [ ] Security Engineer reviews the nonce design (signing, `exp`, cookie attributes, mint/verify).
- [ ] Human approves the coordinated frontend + backend change before merge.
- [ ] Staging login verified before production rollout.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts do not match the live code (drift since `4c6bb4aa`).
- Cognito does **not** relay `state` back unchanged in this deployment — the cookie-bound
  nonce approach must be re-validated against the actual Hosted-UI behavior first.
- The state cookie is **not** returned on the callback navigation despite `SameSite=Lax`
  (e.g. a cross-site deployment topology) — align cookie attributes with the actual callback
  navigation before proceeding; do not switch to `SameSite=None` without security review.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- If the login topology changes (custom domain, cross-site callback), re-check the state
  cookie's `SameSite` behavior — it is the load-bearing assumption here.
- A reviewer should confirm the exchange truly happens **after** verification (the security
  crux) and that no nonce/secret is logged.
- Deferred out of this plan: relay hardening (item A) and any change to `validateRedirectUrl`
  (item C, already closed).
