# api on Lambda Web Functions — design

## Why

AWS launched Lambda Web Functions in October 2026: the code runs as a plain HTTP server on the port given in
`AWS_LAMBDA_HTTP_ENDPOINT`, one execution environment serves up to 128 concurrent requests, and CloudFront can use a
Web Function endpoint directly as an origin. They are available in `eu-central-1`.

The goal is a **simpler setup**, not latency or cost. Today every new endpoint has to be added in three places: the
route handler, the Powertools router and the `api_resources` map in [infra/api_rest.tf](../../../infra/api_rest.tf).
API Gateway sits as an extra layer between CloudFront and the Lambda, and local development runs through
[develop.ts](../../../apps/lambdas/api/src/develop.ts), which builds fake API Gateway events from real HTTP requests.
After the switch, routing lives only in the app, CloudFront talks to the Web Function directly, and local development
runs the same HTTP server as production.

Measured over the 30 days before 2026-10-26 (CloudWatch logs of `gitgazer-api-default`, API Gateway access logs):

- 502k invocations, 3,323 cold starts (0.66 %), each costing about 2 s (690 ms init + 1.35 s first request for the
  lazy `initDb`/`loadConfig`, against a 39 ms p50 warm request). About 84 % happened while other environments were
  alive (scale-out), which Web Functions would avoid; peak was 41 environments at once.
- 96.5 % of requests are GitHub webhook deliveries (`POST /api/import/{integrationId}`); the UI makes about 1–2k API
  calls a month. Cold starts therefore hit webhooks, where they don't matter. This is why latency is not the goal.
- Webhook traffic arrives through the CloudFront distribution `app.gitgazer.com` (514k CloudFront requests vs. 502k
  HTTP API requests), so moving `/api/import/*` needs no change on GitHub's side. The GitHub App's webhook URL is
  `https://app.gitgazer.com/api/github/webhook` and its setup URL `https://app.gitgazer.com/integrations` (confirmed by
  the owner). The Slack OAuth redirects use the custom domain too (`slackApp.*RedirectUri` in
  [infra/secrets.tf](../../../infra/secrets.tf)), and Slack accepts only redirect URLs registered on the app.
- **One exception: Cognito calls the HTTP API directly.** The GitHub OIDC identity provider's `token_url`,
  `attributes_url` and `jwks_uri` point at `${aws_apigatewayv2_api.this.api_endpoint}/api/auth/cognito/...`
  ([infra/cognito.tf](../../../infra/cognito.tf)). In [infra/secrets.tf](../../../infra/secrets.tf), `redirectUri` and
  `importUrlBase` fall back to the `execute-api` host when no custom domain is configured.
- `api` compute costs under $1 a month and the HTTP API about $0.60, so there is nothing meaningful to save.

## Goals

- `api` runs as a Hono HTTP server on a Lambda Web Function, behind CloudFront.
- Routes are defined once, in the app. The HTTP API, its `api_resources` routes, the API Gateway Lambda permission and
  the `live` alias of `api` are gone.
- `pnpm run dev:api` runs the real server, not an event adapter.
- The cutover is **seamless**: no webhook delivery fails because of it. GitHub does not retry failed deliveries
  automatically, so a lost delivery is lost workflow data.

## Non-goals

- The WebSocket API (`api_websocket.tf`) stays on API Gateway. API Gateway as a service therefore remains; only the
  HTTP API goes.
- The other Lambdas (`worker`, `backfill-worker`, `org-sync-scheduler`, `http-proxy`, `websocket`) stay Event
  Functions.
- WAF is not part of this work. It follows as a separate project (see "Throttling").
- The high `/fe-failover` traffic (15.7k requests in 30 days, probably SPA deep links answered with 403/404 by S3) is a
  separate finding and not fixed here; the failover itself keeps working.
- No functional changes to any endpoint.

## Anti-goals

- Losing webhook deliveries during the switch.
- A switch that cannot be undone quickly: until the HTTP API is deleted, any route must be movable back to it.
- Keeping an event-translation layer in production. That is the indirection this work exists to remove.

## Constraints

- Web Functions support only Node.js 24 on **Arm64**. `api` runs on x86_64 today (Lambda's default; nothing in history
  chose it deliberately).
- The shared `local.lambda_layers` in [infra/main.tf](../../../infra/main.tf) hard-codes x86 layer ARNs for all
  Lambdas:
    - `AWS-Parameters-and-Secrets-Lambda-Extension:21`: x86 only; an `…-Arm64` layer exists. No code calls it
      (nothing hits `localhost:2773`; config is read through the SDK), so it looks unused.
    - `LambdaInsightsExtension:64`: x86 only; `LambdaInsightsExtension-Arm64` exists.
    - `AWSOpenTelemetryDistroJs:10`: supports both.
    - Insights and OTEL are attached only when `enable_lambda_tracing` is on, which it isn't in production today.
- The bundle is pure JavaScript (tsup bundles everything except `@aws-sdk`). `pg` references `pg-native` only behind
  `pg.native`, which is never used.
- The Terraform AWS provider has no Web Function resources yet. `aws_lambdaweb_function` and `aws_lambdaweb_endpoint`
  are in open PRs ([#50341](https://github.com/hashicorp/terraform-provider-aws/pull/50341),
  [#50452](https://github.com/hashicorp/terraform-provider-aws/pull/50452), tracking issue
  [#50429](https://github.com/hashicorp/terraform-provider-aws/issues/50429)). The repo locks provider 6.57.1.
  Infrastructure stays in Terraform; no CloudFormation wrapper or click-ops for permanent resources.
- The app currently assumes one request per environment:
    - the DB pool is `max: 1` with a 5 s `connectionTimeoutMillis` ([packages/db/src/client.ts](../../../packages/db/src/client.ts));
    - `logger.resetKeys()` / `addContext()` mutate the shared logger per invocation ([index.ts](../../../apps/lambdas/api/src/index.ts));
    - `initDb`/`loadConfig` run lazily inside the first request.
- Routes depend on API Gateway events: `Router.resolve()` only accepts API Gateway/ALB events, and routes read
  `reqCtx.event` 41 times (`reqCtx.req` 15 times). There are 64 route registrations across 14 domains, plus the global
  middleware `compress`, `cors`, `authenticate`, `originCheck`, and per-route `verifyGithubSign`.

## Decisions

Made by the owner:

- **Two phases.** Phase 1 is everything that doesn't need the Terraform resources and ships to production behind the
  existing HTTP API. Phase 2 starts once the provider releases `aws_lambdaweb_*`.
- **Hono** replaces the Powertools router.
- **One Web Function endpoint, without a rate limit.**
- **WAF later** as its own project. Between the cutover and WAF, the nine public routes that API Gateway throttles today
  (see "Throttling") have no edge throttling; MCP keeps its per-user query quota.
- **Seamless cutover**, moved route by route through CloudFront behaviors, with rollback by pointing a behavior back.
- **A throwaway spike** in phase 1 checks the open platform questions before phase 2 is built on assumptions.
- **Arm64 in phase 1**, while `api` is still behind API Gateway, so architecture problems show up separately from the
  platform switch.

## Phase 1 — before the Terraform resources exist

### 1. Spike (throwaway)

A hello-world Hono server deployed by hand with the CLI (`aws lambda-web …`, needs a current AWS CLI) as a Web
Function in `eu-central-1`, behind a temporary CloudFront distribution. Everything is deleted afterwards and nothing
from it is merged. It answers:

1. **Origin access control and request bodies.** With Lambda Function URLs, OAC requires the viewer to send
   `x-amz-content-sha256` for POST/PUT bodies; GitHub and the SPA can't. Does the same apply to Web Functions? If yes,
   phase 2 uses the fallback: a public endpoint, plus a secret header that CloudFront adds as an origin custom header
   and the app rejects requests without (secret in Secrets Manager, rotatable).
2. **VPC.** The function reaches Aurora in the private subnets with the existing security group and IAM DB auth.
3. **Layers and extensions.** Do Lambda layers work on Web Functions at all (Insights, OTEL)? If not, how do logs,
   metrics and traces get out?
4. **Logging.** Do stdout JSON logs land in the configured log group with the existing format and log levels?
5. **Packaging.** Can the code come from the existing S3 zip (`s3_bucket`/`s3_key`/object version), or does it have to
   be uploaded another way?
6. **Lifecycle.** Is there a startup phase before traffic (for `initDb`/`loadConfig`), is SIGTERM sent before an
   environment is reclaimed, how long do idle environments stay warm, and what are the request timeout and payload
   limits?
7. **Revisions.** Can "Auto deployment: Latest revision" be set through the API (the console says "Only available for
   Home-Region endpoints")?
8. **Streaming.** A streamed response passes through CloudFront unbuffered.
9. **Per-environment concurrency.** Can the number of concurrent requests per environment be capped below 128? Every
   webhook opens a DB transaction in `verifyGithubSign`, and MCP `run_sql` holds a connection for up to 20 s. With the
   5 s `connectionTimeoutMillis`, a pool smaller than the concurrent load fails requests, and failed webhooks are lost.
   The answer sets the pool size and the phase 2 limits.

The Cognito identity provider is a third caller sending POST bodies, next to GitHub and the SPA. After phase 1 step 2
it calls through CloudFront like the others, so the OAC answer covers it as long as CloudFront adds whatever the
endpoint needs.

The results go into this document as an appendix before phase 2 is planned. Answers can change phase 2 (OAC fallback,
observability approach, deploy flow).

### 2. Point Cognito at CloudFront

_My call:_ the identity provider's `token_url`, `attributes_url` and `jwks_uri` move to
`https://<custom domain>/api/auth/cognito/...`, still served by API Gateway behind CloudFront. It ships on its own, in
a quiet hour (a login in progress during the update may fail and has to be retried). Rollback is reverting the
Cognito change. `redirectUri` and `importUrlBase` in `secrets.tf` fall back to the CloudFront domain instead of
`execute-api`, like `mcpServerUrl` already does. After this step nothing outside CloudFront calls the HTTP API.

### 3. Remove the unused secrets extension

If nothing needs it, drop `AWS-Parameters-and-Secrets-Lambda-Extension` from `local.lambda_layers` for all Lambdas.
This shrinks the Arm64 layer question to Insights and OTEL.

### 4. Hono migration

- `api` moves from the Powertools router to Hono, domain by domain, with each step deployable on its own. The handler
  stays an Event Function behind API Gateway during phase 1, using Hono's official AWS Lambda adapter.
- Routes, middleware and helpers use the standard `Request`/`Response` (`c.req`) instead of `reqCtx.event`. Nothing in
  `api` reads API Gateway event fields after phase 1. That includes cookies, query strings, `requestContext`, source IP
  and raw body for `verifyGithubSign`.
- `compress` and `cors` move to Hono's middleware; `authenticate`, `originCheck` and `verifyGithubSign` become Hono
  middleware with the same behavior.
- Responses must stay byte-identical where clients depend on them: status codes, `Set-Cookie` (several cookies per
  response), redirects, content types, compression, CORS headers and error bodies.
- Existing tests keep passing; tests that build API Gateway events are rewritten to call the Hono app with `Request`
  objects.

### 5. Concurrency safety

- The DB pool grows above `max: 1`. _My call:_ a small fixed size (e.g. 10) as a config value; phase 2's "maximum
  environments" × pool size must stay under Aurora's connection limit.
- Logger keys and context are scoped per request (AsyncLocalStorage or Powertools' equivalent), so concurrent requests
  never share log keys.
- Audit `api` and the shared packages it uses for other module-level per-request state (caches keyed by user, mutable
  singletons, `process.env` writes) and make each one request-scoped or safe to share.
- `withRlsTransaction` already sets its tenant settings with `SET LOCAL`; nothing may set them session-wide, so a
  pooled connection never carries one request's tenant into another.
- Test: concurrent requests from different users against one server instance never see each other's data or log keys.

### 6. One server entrypoint

- `src/index.ts` exports the Hono app; a server entrypoint listens on `AWS_LAMBDA_HTTP_ENDPOINT` (or port 8080 locally)
  and runs `initDb`/`loadConfig` before accepting traffic. During phase 1 the Lambda handler wraps the same app.
- `develop.ts` and its fake event builder are deleted; `dev:api` runs the server entrypoint.

### 7. Arm64

- `api` gets `architectures = ["arm64"]`; layers are chosen per architecture (the Insights `-Arm64` layer; OTEL as is).
  _My call:_ only `api` switches; the other Lambdas may follow later but are out of scope.
- Ships on its own and runs in production for a while before phase 2.

## Phase 2 — switch and finish

Starts when the provider release with `aws_lambdaweb_function`/`aws_lambdaweb_endpoint` is out and the spike results
are in. Updating the provider constraint is part of it.

### 1. Web Function next to the HTTP API

- A Web Function for `api` in Terraform, built from the same zip the Event Function uses, with the same IAM role
  permissions, VPC config, environment variables, log group and tracing setting.
- One endpoint, no rate limit. _My call:_ "maximum environments" set so that environments × DB pool size stays well
  under Aurora's connection limit.
- _My call:_ auto deployment to the latest revision, matching today's flow where `terraform apply` makes a new zip
  live. Canary weights between revisions are possible later but not needed now.
- CloudFront gets the endpoint as an additional origin, with OAC or the secret-header fallback from the spike.

### 2. Route-by-route cutover

- CloudFront behaviors move path groups from the API Gateway origin to the Web Function origin, one `terraform apply`
  per step, with a check of errors and logs in between. _My call on the order:_ `/.well-known/*`, then the
  authenticated UI routes (`/api/*` except the next two), then the public auth/Slack/MCP routes, then both webhook
  routes, `/api/import/*` and `/api/github/webhook` (GitHub App installation and membership events, same no-retry
  risk), last.
- While CloudFront propagates a change, some edges still use the old origin. That's harmless because both backends run
  the same code against the same database.
- The `/fe-failover` origin in the frontend origin group moves to the Web Function as well.
- Rollback for any step: point the behavior back to the API Gateway origin.
- Both backends must work the whole time. Changes to `api` during the cutover ship to both.

### 3. Cleanup after a quiet period

_My call:_ at least one week with all traffic on the Web Function and no rollback.

- Delete the HTTP API, its stage, `api_resources` routes, route throttling settings, the API Gateway Lambda permission,
  the `api` Event Function and its `live` alias, and the API Gateway access logs and throttling alarms that only
  concern the HTTP API.
- Update CI/CD (`upload`, `ci_cd_infra.yaml`) if the deploy flow changed, plus `AGENTS.md`, the backend instructions
  and `infra/README.md` (`dev:api`, routes no longer in Terraform).

## Throttling

API Gateway throttles these routes today at 20 req/s (burst 40), globally across all callers
(`auth_relay_throttling`, `mcp_throttling` in [infra/api_rest.tf](../../../infra/api_rest.tf)):
`POST /api/auth/cognito/token`, `GET /api/auth/cognito/user`, `GET /api/slack/oauth/callback`,
`GET /api/slack/sign-in/callback`, `POST /api/mcp`, `POST /api/mcp/oauth/register`, `GET /api/mcp/oauth/authorize`,
`GET /api/mcp/oauth/callback`, `POST /api/mcp/oauth/token`.

After the cutover they are unthrottled until the WAF project adds a rate-based rule per IP, scoped to these paths, on
the CloudFront distribution (about $7 a month). Web Function endpoints also offer a global rate limit, and a second
throttled endpoint for these paths was considered and rejected.

## Left to the builder

- How to split the Hono migration into PRs and in which domain order.
- How to scope logger context per request.
- The exact pool size and "maximum environments" value, within the constraint above.
- Names of the new Terraform resources and files, following the existing layout.
- How to verify each cutover step (CloudWatch queries, alarms), as long as a failing webhook delivery would be noticed
  within minutes.
