# Follow-up Plan (Item A): Harden the GitHub OAuth Relay Endpoints

> **Parent decision:** [`auth-hardening-decisions.md`](./auth-hardening-decisions.md) §A.
> **Status:** Proposed — requires human + Security Engineer review before implementation.
> **Risk:** HIGH (live login path). **Effort:** S–M.
>
> **Executor instructions:** Follow this plan step by step. Run every verification command
> and confirm the expected result before moving to the next step. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise.
>
> **Drift check (run first):**
> `git diff --stat 4c6bb4aa..HEAD -- apps/api/src/domains/users/users.controller.ts apps/api/src/domains/users/users.routes.ts apps/api/src/shared/config.ts`
> This plan was written against commit `4c6bb4aa`. If any in-scope file changed since then,
> compare the "Current state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority:** P1
- **Effort:** S–M
- **Risk:** HIGH (live login path)
- **Depends on:** none
- **Category:** security
- **Planned at:** commit `4c6bb4aa`, 2026-06-14
- **Review gate:** Human + Security Engineer (mandatory before merge)

## Why this matters

`POST /api/auth/cognito/token` and `GET /api/auth/cognito/user` are the **OIDC shim** that
lets AWS Cognito federate to GitHub. They are **LIVE** — wired as the GitHub identity
provider's `token_url`, `attributes_url`, and `jwks_uri` in
[`infra/cognito.tf:28-30`](../infra/cognito.tf). They must not be removed. As written they
are an **open relay**: `exchangeGitHubOAuthToken` forwards arbitrary caller-supplied
`client_id`/`client_secret`/`code` to a fixed GitHub endpoint, and `fetchGitHubUser`
forwards an arbitrary caller-supplied `authorization` header to `api.github.com/user`. OWASP
A04 (Insecure Design), A07 (Identification & Auth), SSRF-adjacent. Severity: Medium. The
goal is to convert the open token relay into a **closed exchange** usable only for the
legitimate GitHub OAuth app, and to stop reflecting upstream error text — without breaking
the Cognito federation handshake.

## Current state

- [`apps/api/src/domains/users/users.routes.ts:9-29`](../apps/api/src/domains/users/users.routes.ts)
  — the two route handlers. `POST /api/auth/cognito/token` parses the body and calls
  `exchangeGitHubOAuthToken(result.client_id, result.client_secret, result.code)`;
  `GET /api/auth/cognito/user` calls `fetchGitHubUser(event.headers['authorization'])`.
- [`apps/api/src/domains/users/users.controller.ts:28-37`](../apps/api/src/domains/users/users.controller.ts)
  — `exchangeGitHubOAuthToken` (the open relay):

    ```ts
    export const exchangeGitHubOAuthToken = async (clientId: string, clientSecret: string, code: string): Promise<unknown> => {
        const response = await proxyFetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Accept: 'application/json'},
            body: JSON.stringify({client_id: clientId, client_secret: clientSecret, code}),
        });
        return response.json();
    };
    ```

- **The GitHub OAuth app credentials are NOT in `config` today.** They exist only as KMS
  secrets consumed by infra in [`infra/cognito.tf:21-22`](../infra/cognito.tf)
  (`gh_oauth_app_client_id`, `gh_oauth_app_client_secret`). Step 1 is therefore **net-new
  config wiring**, not a reference to existing config.
- **Config convention** — see [`apps/api/src/shared/config.ts:118-123`](../apps/api/src/shared/config.ts).
  Sensitive entries set `sensitive: true` and an `env` var; match this shape exactly:

    ```ts
    wsTokenSecret: {
        doc: 'Dedicated HMAC key for signing WebSocket tokens (separate from Cognito client secret)',
        format: String,
        default: '',
        env: 'WS_TOKEN_SECRET',
        sensitive: true,
    },
    ```

- **Error-handling convention** — handlers throw the AWS Powertools HTTP errors imported in
  [`users.routes.ts:3`](../apps/api/src/domains/users/users.routes.ts)
  (`BadRequestError`, `ForbiddenError`). Use `ForbiddenError` for a credential mismatch.

## Commands you will need

| Purpose         | Command (run in `apps/api/`) | Expected on success |
| --------------- | ---------------------------- | ------------------- |
| Unit tests      | `pnpm run test:unit`         | all pass, exit 0    |
| Lint            | `pnpm run lint`              | exit 0              |
| Build (package) | `pnpm run buildZip`          | exit 0              |

## Decision / approach

**Preferred (simpler and strictly safer): do not trust caller-supplied secrets at all.**
The only legitimate caller is the Cognito IdP, which is configured with the _same_ GitHub
OAuth app credentials. So `exchangeGitHubOAuthToken` should **always use the server-config
`client_id`/`client_secret`** and take only `code` from the request. This removes the
comparison surface entirely (nothing to compare, nothing to leak).

If product requires preserving the request-supplied-credentials contract, fall back to
**validating** them against config — but do it safely (see Step 2's `timingSafeEqual`
caveat). Decide with the Security Engineer; default to the preferred approach.

For the **user proxy** (`fetchGitHubUser`): it forwards a _per-user_ GitHub token that
Cognito holds — there is **no static secret to pin it against**. Its only available controls
are (a) keep the upstream host fixed (already true) and (b) stop reflecting upstream error
bodies. Edge rate-limiting belongs to the sibling infra plan, not here.

> **Coupling note.** The configured secret must match `provider_details.client_secret` on
> the Cognito IdP. Source both from the **same** KMS material so there is a single source of
> truth; do not hand-duplicate the secret value.

## Scope

**In scope** (the only files you should modify):

- `apps/api/src/shared/config.ts` — add the two new sensitive config entries.
- `apps/api/src/domains/users/users.controller.ts` — use config creds; stop reflecting error text.
- `apps/api/src/domains/users/users.routes.ts` — only if the handler signature must change.
- `apps/api/src/domains/users/users.controller.test.ts` (create if absent) — tests.

**Out of scope** (do NOT touch):

- `apps/api/src/domains/auth/**` — the user-facing Cognito leg and token cookies are a
  separate flow (and item B). Changing them here risks the login path.
- `infra/**` — edge rate-limiting / WAF is the **sibling plan** below, with its own review
  gate. Do not modify Terraform in this plan.
- The fixed upstream hosts (`github.com/login/oauth/access_token`, `api.github.com/user`) —
  do not broaden or parameterize them.

## Git workflow

- Branch: `advisor/auth-relay-hardening` (or the repo's convention).
- Commits follow conventional-commit style (see `git log`, e.g.
  `feat(webhook-provisioning): …`). Do NOT push or open a PR unless the operator instructs.

## Steps

### Step 1: Add the GitHub OAuth app credentials to config

Add two **sensitive** entries to [`config.ts`](../apps/api/src/shared/config.ts) matching the
`wsTokenSecret` shape, sourced (in infra) from the existing `gh_oauth_app_client_id` /
`gh_oauth_app_client_secret` KMS material — do **not** introduce a second copy of the secret.

```ts
githubOAuthApp: {
    clientId: { doc: 'GitHub OAuth app client ID (matches the Cognito IdP)', format: String, default: '', env: 'GH_OAUTH_APP_CLIENT_ID' },
    clientSecret: { doc: 'GitHub OAuth app client secret (matches the Cognito IdP)', format: String, default: '', env: 'GH_OAUTH_APP_CLIENT_SECRET', sensitive: true },
},
```

**Verify:** `pnpm run lint` → exit 0 (config schema still valid).

### Step 2: Use config credentials in the token exchange

**Preferred:** change `exchangeGitHubOAuthToken` to read `client_id`/`client_secret` from
`config.get('githubOAuthApp.*')` and accept only `code` from the caller. Drop the
caller-supplied `clientId`/`clientSecret` parameters (update the call site in
`users.routes.ts` accordingly). No comparison is needed.

**Fallback only (if the request-supplied-credentials contract must stay):** compare incoming
vs configured credentials. ⚠️ **`crypto.timingSafeEqual` throws on unequal-length buffers
and leaks length.** Never feed raw user input to it directly. Hash both sides to a fixed
width first:

```ts
import {createHash, timingSafeEqual} from 'node:crypto';
const eq = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
// reject with: throw new ForbiddenError('Invalid client credentials');  // no upstream call
```

**Verify:** `pnpm run test:unit` → the new tests in Step 4 pass.

### Step 3: Stop reflecting upstream error text

In both `exchangeGitHubOAuthToken` and `fetchGitHubUser`, return a **generic** error body to
the caller and log the upstream detail server-side only (use the existing logger; do not log
tokens or secrets). Keep the fixed upstream host in `fetchGitHubUser` unchanged.

**Verify:** `pnpm run test:unit` → the error-reflection test passes.

### Step 4: Tests

See "Test plan" — write the tests, then run `pnpm run test:unit`.

## Test plan

Create `apps/api/src/domains/users/users.controller.test.ts` (model structure after any
existing `*.controller.test.ts` in `apps/api/src/domains/`). Mock `proxyFetch` — never call
real GitHub.

- **Preferred path:** token exchange uses config credentials regardless of request body;
  `proxyFetch` is called with the configured `client_id`/`client_secret` and the caller's `code`.
- **Fallback path (if implemented):** wrong `client_secret` → `ForbiddenError`, and
  `proxyFetch` is **not** called.
- Missing params → `400` (existing behavior preserved).
- Upstream failure → generic error body returned; raw upstream text **not** present in the
  response (assert the upstream message string is absent).

**Verify:** `pnpm run test:unit` → all pass, including the new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run test:unit` exits 0; new `users.controller.test.ts` tests exist and pass.
- [ ] `pnpm run lint` exits 0.
- [ ] `grep -n "client_secret: clientSecret" apps/api/src/domains/users/users.controller.ts`
      returns no match **only if** the preferred approach was taken (caller secret no longer forwarded).
- [ ] No raw upstream `response` body string is returned to callers (verified by the
      error-reflection test).
- [ ] `git status` shows only in-scope files modified; `infra/**` untouched.

## Security-review gate

- [ ] Security Engineer reviews the chosen approach (preferred vs fallback) and, if the
      fallback is used, the hashed `timingSafeEqual` comparison.
- [ ] Human approves before merge.
- [ ] Staging login verified before production rollout.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts do not match the live code (drift since `4c6bb4aa`).
- Pinning/using the config secret would break a second, **undocumented** consumer of these
  endpoints — re-do the usage analysis first.
- The GitHub OAuth `client_secret` cannot be sourced to the API from the **same** KMS
  material the IdP uses (i.e. a fix would require duplicating the secret) — design a single
  source of truth first.
- A verification command fails twice after a reasonable fix attempt.

## Sibling plan (edge controls — separate review gate)

Edge rate-limiting / WAF for the `/api/auth/cognito/*` prefix is an **infra-only** change
(API Gateway throttling or a WAF rate-based rule in `infra/`) with a different blast radius
and reviewer than the TypeScript change above. Track it as a separate plan
(`auth-relay-edge-controls`) so each has a clean, independent verification story. Do not
bundle it into this plan's diff.

## Maintenance notes

- If a future change adds a third legitimate caller of these endpoints, the
  preferred-approach assumption ("only Cognito calls this") must be revisited.
- A reviewer should scrutinize that no secret value is logged and that the upstream host in
  `fetchGitHubUser` stays fixed.
- Deferred out of this plan: edge rate-limiting (sibling plan) and any change to the
  user-facing Cognito leg (item B).
