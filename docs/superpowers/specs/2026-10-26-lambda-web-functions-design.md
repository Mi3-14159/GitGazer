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
- The `awscc` provider (Cloud Control API) has them since 1.107.0 (October 21, 2026): `awscc_lambda_web_function`,
  `awscc_lambda_web_function_revision`, `awscc_lambda_web_function_endpoint`, `awscc_lambda_network_connector` and
  `awscc_lambda_resource_policy`. The repo already uses `awscc` (lock 1.94.0). The endpoint pins revisions through
  `revision_weights` (one or two entries); it has no "follow the latest revision" setting.
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
  existing HTTP API. Phase 2 starts once Terraform can manage Web Functions; it uses the `awscc` resources (2026-10-27),
  without a separate Terraform spike.
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

Built with the `awscc` resources; the `awscc` constraint moves to `~> 1.107`. If `aws_lambdaweb_*` ships later,
switching providers is its own change (`removed` plus `import` blocks), not part of this phase.

### 1. Web Function next to the HTTP API

- A Web Function for `api` (`awscc_lambda_web_function`), with the same environment variables as the Event Function.
  _My call:_ it reuses the `api` IAM role, whose trust policy already allows `lambda.amazonaws.com`.
- _My call:_ **one zip for both.** The bundle's `index.js` keeps exporting the Event Function `handler` and, when
  `AWS_LAMBDA_HTTP_ENDPOINT` is set, also starts the HTTP server from `server.ts`. One build, one upload, one S3
  object version for both backends, which is what "changes ship to both" needs during the cutover.
- _My call:_ **a revision per code version.** `awscc_lambda_web_function_revision` points at the zip's
  `s3_object_version`; a new version replaces the revision (create before destroy), and the endpoint's
  `revision_weights` sends 100 % to the current one. That is the same flow as today's `live` alias: `terraform apply`
  makes a new zip live. Two weights for a canary are possible later.
- VPC access through an `awscc_lambda_network_connector` on the `api` subnets and security group, with its own
  operator role for the ENIs; the revision uses the connector's `latest_version_arn`.
- The code bucket gets a policy that lets `lambda.amazonaws.com` read the zip, scoped with `aws:SourceAccount`.
- Logs go to a Terraform-managed log group with the same retention as `api` (revision `logging_config.log_group`).
  Lambda layers aren't supported, so the Web Function runs without Insights or OTEL; `enable_lambda_tracing` keeps
  applying to the Event Functions only.
- One endpoint, HomeRegion, `IamAuth`, no rate limit. _My call:_ `DB_POOL_MAX` and the endpoint's `max_environments`
  are set so that environments × pool size plus the other Lambdas stay at most half of Aurora's `max_connections`
  (checked with `SHOW max_connections` before choosing). `max_concurrency_per_environment` keeps its default.
- CloudFront gets the endpoint as an additional origin: OAC with origin type `lambda`, signing always, origin request
  policy `AllViewerExceptHostHeader`, caching disabled, and an `awscc_lambda_resource_policy` on the **endpoint** ARN
  that allows `lambda:InvokeWebFunctionEndpoint` for the distribution (`aws:SourceArn`).

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
  concern the HTTP API. The bundle then drops the Event Function `handler` and `@hono/aws-lambda`.
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

## Appendix: spike results

Run live on 2026-10-26/27 in `eu-central-1` with a throwaway Hono app (Node 24) behind a temporary CloudFront
distribution with origin access control, a VPC network connector to the `api` subnets and a 30 s timeout. All
resources were deleted afterwards. Unless noted, requests went through CloudFront.

| #   | Question                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | OAC and request bodies      | Works without a fallback. CloudFront signs with `UNSIGNED-PAYLOAD`; a POST body without `x-amz-content-sha256` arrived byte-identical (same SHA-256). A direct unsigned call to the endpoint returns 403. Requires endpoint `authType: IamAuth`, OAC `lambda` / `always-amz-auth` / `sigv4`, origin request policy `AllViewerExceptHostHeader`, and a resource policy on the function whose `Resource` is the **endpoint** ARN (`<function arn>/endpoint/<name>`) with `StringEquals aws:SourceArn` = distribution ARN. A policy on the function ARN alone gives 403. |
| 2   | VPC                         | Works, but not as a deploy flag: a separate `lambda-core` network connector (subnets, security group, own operator role with ENI permissions, ~2 min to `ACTIVE`) whose version ARN goes into the revision's `egressNetworkConnectorArn`. IAM DB auth to Aurora: `select 1` in 72 ms.                                                                                                                                                                                                                                                                                 |
| 3   | Layers                      | Not supported. The API has no layers, architecture or memory fields (fixed Arm64, Node `v24.22.1`). Insights and the OTEL layer can't be attached; tracing would have to be in-process (ADOT as a library).                                                                                                                                                                                                                                                                                                                                                           |
| 4   | Logging                     | Lambda wraps console output as `{timestamp, level, message, requestId, endpointName, region}`. `console.log(object)` keeps `message` as JSON; `console.log(JSON.stringify(...))` turns it into an escaped string; `process.stdout.write(json)` passes the line through unchanged. Log groups: `/aws/lambda/web/<fn>` and `<…>.local`; application and system log levels are set per revision.                                                                                                                                                                         |
| 5   | Packaging                   | Code comes from S3 with `bucket`/`key`/`versionId` (versioned bucket works). The bucket needs a policy granting `lambda.amazonaws.com` `s3:GetObject`/`s3:GetObjectVersion` (scoped with `aws:SourceAccount`). The zip needs `index.js` at its root.                                                                                                                                                                                                                                                                                                                  |
| 6   | Lifecycle                   | Init (`platform.initReport`) 255–394 ms. First request through CloudFront 0.85 s cold, 0.4 s warm (from a laptop in Germany). Idle environments were replaced within 5 minutes; environments lived 5–16 minutes. `SIGTERM` arrives (`platform.spinDownStart`). Responses of 30 MB passed; requests of 10 MB passed, 30 MB once passed and once returned 504.                                                                                                                                                                                                          |
| 7   | Auto deployment             | `autoDeploymentMode: LatestRevision` can be set through the API when creating a `HomeRegion` endpoint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8   | Streaming                   | Works through CloudFront unbuffered (chunks arrived one per second).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 9   | Per-environment concurrency | `maxConcurrencyPerEnvironment` (1–128, default 64) is only an upper bound; Lambda picks the actual limit and adds environments instead of packing them. With the default, environments ran 2–14 requests at once, and the same load needed 20 environments on a new function and 4–9 later. The first run (limit 8, bursts of 64–200 parallel 2 s requests queueing up to 145 s) is **not reliable**: the laptop generating the load hit TCP connect timeouts even against a static CloudFront file. See the load test below.                                         |
| 10  | `AWS_LAMBDA_HTTP_ENDPOINT`  | `0.0.0.0:3000`. The request id arrives as header `lambda-web-request-id` (also `x-amz-cf-id`, `x-forwarded-for`, `via`).                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Load test.** Production peaks at 76 requests in one second. The test route did one 40 ms database round trip on a
shared pool. An open-loop generator ran in AWS CloudShell in `eu-central-1` against the CloudFront URL.

| Run                                        | Client side                                | Function side                                 |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------- |
| 80 req/s × 15 s, 3 rounds                  | all 200; p50 51–52 ms, p99 216–710 ms      | 7 environments, up to 13 requests each        |
| 240 req/s × 15 s                           | all 200; p50 51 ms, p99 838 ms, max 1.2 s  | 12 environments, up to 14 requests each       |
| 200 parallel requests that each wait 2 s   | all 200; p50 2.03 s, max 2.2 s             | all 200 reached the app within 2 s            |
| 80 req/s after 10 min idle (all envs gone) | all 200; p50 52 ms, p99 738 ms, max 911 ms | 7 new environments, caught up within a second |

No run produced a 429 or 5xx. The higher p99 values come from the first second of a run, while environments start.
Earlier runs from a laptop showed multi-second stalls that the laptop's network caused: a control against a cached
static file on CloudFront at the same rate failed with TCP connect timeouts.

**Consequences for phase 2:**

- **Webhook bursts are not a blocker.** A cold function absorbed 80 req/s with a max of 0.9 s, 3× the production
  peak stayed at p99 under 1 s, and 200 parallel slow requests did not queue. The webhook routes can move to the Web
  Function; watch the latency of `/api/import/*` during the route-by-route cutover.
- Tracing needs an in-process approach; the Insights and OTEL layers are gone. Production has tracing off today.
- Powertools Logger must write through `process.stdout` (as it does with its own `Console` instance) so log lines stay
  JSON; verify in phase 2.
- Terraform needs the network connector, its operator role, the bucket policy for `lambda.amazonaws.com` and the
  endpoint-scoped resource policy in addition to the function and endpoint.
- Task 11's request id comes from `lambda-web-request-id`, and `AWS_LAMBDA_HTTP_ENDPOINT` is `host:port`.
