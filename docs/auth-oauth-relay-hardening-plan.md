# Follow-up Plan (Item A): Harden the GitHub OAuth Relay Endpoints

> **Parent decision:** [`auth-hardening-decisions.md`](./auth-hardening-decisions.md) §A.
> **Status:** Proposed — requires human + Security Engineer review before implementation.
> **Risk:** HIGH (live login path). **Effort:** S–M.

## Status

Proposed (human-review gated)

## Context

`POST /api/auth/cognito/token` and `GET /api/auth/cognito/user`
([`users.routes.ts`](../apps/api/src/domains/users/users.routes.ts),
[`users.controller.ts`](../apps/api/src/domains/users/users.controller.ts)) are the **OIDC
shim** that lets AWS Cognito federate to GitHub. They are **LIVE** — wired as the GitHub
identity provider's `token_url`, `attributes_url`, and `jwks_uri` in
[`infra/cognito.tf`](../infra/cognito.tf). They must not be removed.

As written they are an **open relay**: both forward arbitrary caller-supplied credentials
(`client_id`/`client_secret`/`code`, or an `authorization` header) to a fixed GitHub
endpoint. OWASP A04 (Insecure Design), A07 (Identification & Auth), SSRF-adjacent. Severity:
Medium.

The goal is to convert the open relay into a **closed exchange** that only works for the
legitimate GitHub OAuth app, without breaking the Cognito federation handshake.

## Decision / approach

1. **Pin credentials server-side.** Add the GitHub OAuth app `client_id` and
   `client_secret` to `config` ([`config.ts`](../apps/api/src/shared/config.ts)) sourced from
   Secrets Manager (the same values configured on the Cognito IdP in `infra/cognito.tf`). In
   `exchangeGitHubOAuthToken`, **validate** the incoming `client_id`/`client_secret` against
   the configured values using a constant-time comparison and reject mismatches with
   `401`/`403`. Continue to use the caller-supplied `code` (that is legitimately per-request).
2. **Constrain the user proxy.** `fetchGitHubUser` keeps the fixed upstream host
   (`api.github.com/user`); do not broaden it. Do not reflect upstream error bodies verbatim
   — return a generic message and log details server-side only.
3. **Edge controls.** Add rate limiting / WAF rules for the `/api/auth/cognito/*` prefix
   (API Gateway throttling or WAF rate-based rule) in `infra/`.

> **Coupling note.** The configured secret must match
> `provider_details.client_secret` on the Cognito IdP. Ship the API change together with an
> `infra/` review so the values stay in sync.

## Steps

1. Add `githubOAuthApp.clientId` / `githubOAuthApp.clientSecret` (sensitive) to
   `config.ts`, sourced from the existing KMS/Secrets Manager material used in
   `infra/cognito.tf` (`gh_oauth_app_client_id`, `gh_oauth_app_client_secret`).
2. In `users.controller.ts` `exchangeGitHubOAuthToken`, compare the incoming credentials to
   config with `crypto.timingSafeEqual`; throw `UnauthorizedError` on mismatch.
3. Stop returning raw upstream error text to callers in both controller functions.
4. Add API Gateway throttling / WAF rate limiting for `/api/auth/cognito/*` in `infra/`.
5. Update any operator docs noting the endpoints are an internal IdP shim, not a public API.

## Tests

- Unit (Vitest, mock `proxyFetch`): valid pinned credentials → exchange proceeds; wrong
  `client_secret` → `401`/`403`, **no** upstream call; missing params → `400` (existing
  behavior preserved).
- Unit: upstream failure → generic error body, details logged but not reflected.
- Regression: a full Cognito federated login still succeeds end-to-end in a test/staging
  environment after the infra change.

## Security-review gate

- [ ] Security Engineer agent reviews the threat model and the constant-time comparison.
- [ ] Human approves the coordinated API + `infra/` change before merge.
- [ ] Staging login verified before production rollout.

## STOP conditions

- If pinning the secret would break a second, undocumented consumer of these endpoints —
  STOP and re-do the usage analysis.
- If the IdP `client_secret` cannot be sourced to the API without duplicating the secret —
  STOP and design a single source of truth first.
