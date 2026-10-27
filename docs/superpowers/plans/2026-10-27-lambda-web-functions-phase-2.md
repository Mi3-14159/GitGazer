# Lambda Web Functions Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the `api` from an AWS Lambda Web Function behind CloudFront, move the traffic route group by route group, then delete the API Gateway HTTP API and the `api` Event Function.

**Architecture:** One zip serves both backends: `index.js` exports the Event Function `handler` and starts the Hono HTTP server when `AWS_LAMBDA_HTTP_ENDPOINT` is set. Terraform builds the Web Function with the `awscc` resources (function, revision per code version, endpoint, network connector, resource policy) and adds it as a CloudFront origin with OAC. A local map in `cloudfront.tf` decides per route group which origin serves it, so every cutover step and every rollback is a one-value change.

**Tech Stack:** TypeScript, Hono, `@hono/node-server`, Vitest, Terraform (`hashicorp/aws ~> 6.3`, `hashicorp/awscc ~> 1.107`), CloudFront, Aurora PostgreSQL.

**Spec:** [docs/superpowers/specs/2026-10-26-lambda-web-functions-design.md](../specs/2026-10-26-lambda-web-functions-design.md) — section "Phase 2" and the spike appendix.

## Global Constraints

- No client-visible change: same paths, methods, statuses, bodies, headers, cookies, redirects on either backend.
- Infrastructure stays in Terraform; no click-ops for permanent resources. Web Function resources come from `awscc` (`~> 1.107`).
- Web Functions run Node.js 24 (`nodejs24.x`) on Arm64; no layers.
- One endpoint: `endpoint_type = "HomeRegion"`, `auth_type = "IamAuth"`, no `throttle_config`.
- Both backends run the same code from the same S3 object version during the cutover.
- `DB_POOL_MAX` × `max_environments` plus the other Lambdas stays at most half of Aurora's `max_connections`.
- Nothing private in the repo: no AWS profile names, no own account id.
- Subagents have no AWS credentials. The owner runs every `terraform plan`/`apply` and every check against AWS; implementers run `terraform fmt -check` and `terraform validate` only.
- Commits: one-line Conventional Commits, no body, no trailers. One PR per task, merged in order; Tasks 4–7 each need one day without errors before the next one merges.
- Comments only for a non-obvious why. Keep code as simple as possible.

## Review Focus

1. A new zip version while traffic flows: the new revision must exist before the endpoint points at it, and the old revision may only go after that (Task 2, Step 6).
2. POST bodies and signatures through CloudFront OAC: a GitHub webhook must still verify (Task 7, Step 3).
3. Several `Set-Cookie` headers through the Web Function and CloudFront: sign-in must set all auth cookies (Task 5, Step 3).
4. SPA deep links when S3 answers 403: the origin group must fail over to the Web Function's `/fe-failover` (Task 5, Step 3).
5. Errors on the Web Function must raise the error-log alarm even if Lambda wraps the log line (Task 2, Step 2 and Step 7).

---

### Task 1: Start the HTTP server from the Lambda bundle

**Files:**

- Modify: `apps/lambdas/api/src/index.ts`, `apps/lambdas/api/src/server.ts`, `apps/lambdas/api/package.json` (`dev:api`)
- Test: `apps/lambdas/api/src/index.test.ts`
- Docs: `apps/lambdas/api/README.md`, `.github/instructions/backend.instructions.md` where they describe `dev:api` or `server.ts`

**Interfaces:**

- Consumes: `startServer(endpoint?: string): Promise<Server>` from `src/server.ts`.
- Produces: the zip's `index.js` starts listening on `AWS_LAMBDA_HTTP_ENDPOINT` when that variable is set and only exports `handler` otherwise. `server.ts` no longer has a `require.main` block.

- [ ] **Step 1: Write the failing tests** in `index.test.ts` (mock `@/server`, use `vi.resetModules()` and `vi.stubEnv` per test):

```ts
it('starts the http server when AWS_LAMBDA_HTTP_ENDPOINT is set', async () => {
    vi.stubEnv('AWS_LAMBDA_HTTP_ENDPOINT', '0.0.0.0:3000');
    await import('@/index');
    expect(startServer).toHaveBeenCalledTimes(1);
});

it('only exports the handler on an Event Function', async () => {
    vi.stubEnv('AWS_LAMBDA_HTTP_ENDPOINT', '');
    const mod = await import('@/index');
    expect(startServer).not.toHaveBeenCalled();
    expect(mod.handler).toBeTypeOf('function');
});
```

- [ ] **Step 2:** Run `pnpm exec vitest --project unit --run src/index.test.ts` in `apps/lambdas/api`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `index.ts`, when `process.env.AWS_LAMBDA_HTTP_ENDPOINT` is non-empty, call `startServer()` and on rejection log `Server failed to start` and `process.exit(1)` (move that block from `server.ts`). Delete the `require.main === module` block from `server.ts`; in the bundle `module` is `index.js`, so that check is not reliable. `dev:api` becomes `AWS_LAMBDA_HTTP_ENDPOINT=127.0.0.1:8080 node --env-file=.env --watch -r ts-node/register src/index.ts`; keep the `127.0.0.1:8080` default in `startServer`.
- [ ] **Step 4:** Run the api suite, `pnpm run typecheck`, `pnpm run lint`, `pnpm exec prettier --check src`, `pnpm run build`. Expected: all pass; `unzip -l dist/gitgazer-api.zip` lists `index.js` at the root, and `grep -c "node-server" tmp/index.js` is at least 1.
- [ ] **Step 5:** Commit: `feat: start the http server from the lambda bundle on web functions`.
- [ ] **Step 6 (owner, after deploy):** `pnpm run dev:api` with AWS credentials, then `GET /api/user` with a session cookie through the Vite proxy returns the same body as on production.

### Task 2: Web Function in Terraform

**Files:**

- Modify: `infra/main.tf` (awscc constraint; `local.api_environment`; `monitored_lambda_log_groups`), `infra/.terraform.lock.hcl`, `infra/api_rest_lambda.tf` (use `local.api_environment`), `infra/s3_lambda_store.tf` (statement for Lambda), `infra/monitoring_alarms.tf` (filter pattern)
- Create: `infra/api_web_function.tf`
- Docs: `infra/README.md` (terraform-docs tables)

**Interfaces:**

- Consumes: `aws_iam_role.api`, `aws_security_group.lambda`, `local.private_subnets`, `data.aws_s3_object.api_lambda_function_archive`, `module.lambda_store`, the zip from Task 1.
- Produces: `awscc_lambda_web_function_endpoint.api` with attributes `domain_name` and `endpoint_arn` (Task 3); log group `aws_cloudwatch_log_group.api_web`.

- [ ] **Step 1 (owner):** On the bastion, run `SHOW max_connections;` against the production cluster and note the value as `M`. Set `api_web_db_pool_max = 5` and `api_web_max_environments = min(10, floor((M / 2 - 20) / 5))`; the 20 is the budget for the other Lambdas. Write both as locals in `api_web_function.tf`.
- [ ] **Step 2: Error-log filter.** In `monitoring_alarms.tf`, extend the `lambda_error_logs` pattern with `|| ($.message.level = "ERROR")` so the filter also matches if Lambda wraps a line as `{"message": {...}}` (spike Q4). Add `api_web = aws_cloudwatch_log_group.api_web.name` to `monitored_lambda_log_groups`.
- [ ] **Step 3: Shared environment.** Move the Event Function's environment variables into `local.api_environment` (without `AWS_LAMBDA_EXEC_WRAPPER` and `OTEL_NODE_DISABLED_INSTRUMENTATIONS`, which stay inline in `aws_lambda_function.api`). The Web Function uses `merge(local.api_environment, {DB_POOL_MAX = tostring(local.api_web_db_pool_max)})`. `terraform plan` must show no change to `aws_lambda_function.api`.
- [ ] **Step 4: Resources** in `api_web_function.tf`, names `"${var.name_prefix}-api-web-${terraform.workspace}"` unless the resource needs another form:
    - `aws_cloudwatch_log_group.api_web`, `retention_in_days = 30`.
    - `aws_iam_role.api_web_connector` (trust `lambda.amazonaws.com`) with an inline policy copied from the spike: `ec2:CreateNetworkInterface` on `network-interface/*`, `subnet/*`, `security-group/*`; `ec2:CreateTags` on `network-interface/*` when `ec2:ManagedResourceOperator = network-connectors.lambda.amazonaws.com`; `ec2:DeleteNetworkInterface`, `ec2:DescribeNetworkInterfaces`, `ec2:DescribeSubnets`, `ec2:DescribeSecurityGroups`, `ec2:DescribeVpcs` on `*`.
    - `awscc_lambda_network_connector.api` with `vpc_egress_configuration` (`subnet_ids = local.private_subnets`, `security_group_ids = [aws_security_group.lambda.id]`) and `operator_role` = that role.
    - `awscc_lambda_web_function.api`.
    - `terraform_data.api_code_version` with `input = data.aws_s3_object.api_lambda_function_archive.version_id`.
    - `awscc_lambda_web_function_revision.api`: S3 object (bucket, key, `version_id`), runtime `nodejs24.x`, `execution_role_arn = aws_iam_role.api.arn`, `egress_network_connector_arn = awscc_lambda_network_connector.api.latest_version_arn`, the merged environment, `timeout_seconds = 30`, logging `log_group = aws_cloudwatch_log_group.api_web.name`, `application_log_level = local.lambda_application_log_level`, `system_log_level = "INFO"`; `lifecycle { create_before_destroy = true, replace_triggered_by = [terraform_data.api_code_version] }`.
    - `awscc_lambda_web_function_endpoint.api`: `endpoint_name = "default"`, `HomeRegion`, `IamAuth`, `revision_weights = [{revision_id = awscc_lambda_web_function_revision.api.revision_id, weight = 100}]`, `scaling_config.max_environments = local.api_web_max_environments`.
    - In `s3_lambda_store.tf`, a statement allowing `lambda.amazonaws.com` `s3:GetObject` and `s3:GetObjectVersion` on `"${module.lambda_store.s3_bucket_arn}/*"` with `StringEquals aws:SourceAccount = data.aws_caller_identity.current.account_id`.
- [ ] **Step 5:** Bump the constraint to `version = "~> 1.107"` and update only the awscc lock entry with `terraform providers lock` for the platforms already in `.terraform.lock.hcl` and `hashicorp/awscc` (no `init -upgrade`, which would also move the aws provider). Then `terraform fmt -check`, `terraform validate`, update `infra/README.md`. Commit: `feat: add the api web function next to the http api`.
- [ ] **Step 6 (owner):** `terraform plan` shows only additions plus the filter change; apply. Then upload a rebuilt zip and apply again: the plan must show the revision "replaced (create before destroy)" and the endpoint updated in place. During that apply, `curl` the endpoint's `domain_name` in a loop: every answer is `403` (unsigned, IamAuth), never a connection error.
- [ ] **Step 7 (owner):** In the `api_web` log group, the server's `Server listening` line exists. Produce a real `ERROR` line on the Web Function (Powertools writes errors to stderr, which spike Q4 did not test), for example a request whose handler fails, and run `aws logs test-metric-filter` with the filter pattern against it and against the `Server listening` line: only the `ERROR` line matches. If it does not, adjust the pattern to the shape Lambda gives stderr lines before Task 4. The `api_web_5xx` alarm (on `AWS/Lambda/Web` `HTTPResponseStatusClass5XX`) also catches failures that never log, such as timeouts.

### Task 3: CloudFront origin and switchable route groups

**Files:**

- Modify: `infra/cloudfront.tf`, `infra/api_web_function.tf` (resource policy)

**Interfaces:**

- Consumes: `awscc_lambda_web_function_endpoint.api.domain_name`, `.endpoint_arn`.
- Produces: `local.api_cutover`, a map from route group to `"apigw"` or `"web"`, all `"apigw"` in this task. Tasks 4–7 flip one entry each.

- [ ] **Step 1: OAC and origins.** `aws_cloudfront_origin_access_control.api_web` (`origin_access_control_origin_type = "lambda"`, `signing_behavior = "always"`, `signing_protocol = "sigv4"`). Origins `api-web` and `api-web-frontend` (the latter with `origin_path = "/${local.frontend_failover_sub_path}"`), both on the endpoint's `domain_name` with that OAC.
- [ ] **Step 2: Resource policy.** `awscc_lambda_resource_policy.api_web` on `resource_arn = awscc_lambda_web_function_endpoint.api.endpoint_arn`: allow `cloudfront.amazonaws.com` `lambda:InvokeWebFunctionEndpoint` with `StringEquals aws:SourceArn = aws_cloudfront_distribution.this.arn`. A policy on the function ARN alone returns 403 (spike Q1).
- [ ] **Step 3: Route groups.** Define in `cloudfront.tf`:

```hcl
api_cutover = {
  well_known  = "apigw" # /.well-known/oauth-protected-resource, /.well-known/oauth-authorization-server
  ui          = "apigw" # /api/* without the groups below, and the fe-failover member of the origin group
  public      = "apigw" # /api/auth/*, /api/slack/*, /api/mcp, /api/mcp/*
  webhooks    = "apigw" # /api/import/*, /api/github/*
}
```

Generate the `ordered_cache_behavior` blocks from an ordered list of `{path_pattern, group, response_headers_policy_id, allowed_methods}` with a `dynamic` block: the `public` and `webhooks` patterns first, then `/api/*`, then the two `/.well-known` paths, keeping today's settings per path (`cors_policy` for `/api/*` paths, `public_metadata_cors` and GET/HEAD/OPTIONS for `/.well-known`). `target_origin_id` is the API Gateway origin for `"apigw"` and `api-web` for `"web"`. The origin group's second member is `"${aws_apigatewayv2_api.this.id}-frontend"` or `api-web-frontend` depending on `local.api_cutover.ui`.

- [ ] **Step 4:** `terraform fmt -check`, `terraform validate`. Commit: `feat: add the api web function as a cloudfront origin`.
- [ ] **Step 5 (owner):** `terraform plan`: new origins, OAC, resource policy and the extra behaviors, all still targeting API Gateway. After apply, `curl -s -o /dev/null -w '%{http_code}' https://<app domain>/api/user` is still `401` and API Gateway's access log shows the request.

### Task 4: Cutover step 1 — `/.well-known`

**Files:** Modify `infra/cloudfront.tf` (`well_known = "web"`).

- [ ] **Step 1:** Flip the value; `terraform fmt -check`, `terraform validate`. Commit: `feat: serve the oauth discovery documents from the web function`.
- [ ] **Step 2 (owner):** Apply. After the distribution deploys, both documents return the same JSON as before (`diff` against a copy taken before the apply), and the `api_web` log group shows the requests.
- [ ] **Step 3 (owner):** One day without new entries in the `api_web` error-log alarm or the CloudFront 5xx alarm. Rollback: set the value back to `"apigw"` and apply.

### Task 5: Cutover step 2 — UI routes and fe-failover

**Files:** Modify `infra/cloudfront.tf` (`ui = "web"`).

- [ ] **Step 1:** Flip the value; fmt and validate. Commit: `feat: serve the authenticated api routes from the web function`.
- [ ] **Step 2 (owner):** Apply; the app works (overview, workflows, notifications, integrations, members).
- [ ] **Step 3 (owner):** Sign out and in again: the browser stores `accessToken`, `idToken` and `refreshToken` as separate cookies. Open `https://<app domain>/integrations/does-not-exist` in a fresh tab: the SPA loads (S3 answers 403, the origin group falls back to the Web Function's `/fe-failover`).
- [ ] **Step 4 (owner):** One day without alarms; compare p50/p99 of the `api_web` requests with API Gateway's from the day before. Rollback: `ui = "apigw"`.

### Task 6: Cutover step 3 — public auth, Slack and MCP routes

**Files:** Modify `infra/cloudfront.tf` (`public = "web"`).

- [ ] **Step 1:** Flip; fmt and validate. Commit: `feat: serve the public auth, slack and mcp routes from the web function`.
- [ ] **Step 2 (owner):** Apply; sign in with GitHub in a private window (Cognito calls `/api/auth/cognito/token` and `/api/auth/cognito/user` through CloudFront), connect an MCP client, start the Slack sign-in. All succeed.
- [ ] **Step 3 (owner):** One day without alarms. Rollback: `public = "apigw"`.

### Task 7: Cutover step 4 — webhooks

**Files:** Modify `infra/cloudfront.tf` (`webhooks = "web"`).

- [ ] **Step 1:** Flip; fmt and validate. Commit: `feat: serve the github webhooks from the web function`.
- [ ] **Step 2 (owner):** Apply during a quiet hour; watch the `api_web` log group for `POST /api/import/` and `POST /api/github/webhook` with status 200 for 15 minutes.
- [ ] **Step 3 (owner):** In the GitHub App's "Recent Deliveries", redeliver one `workflow_job` event: the response is 200 and the event shows up in GitGazer. Rollback: `webhooks = "apigw"`.
- [ ] **Step 4 (owner):** One week with all groups on `"web"` and no rollback before Task 8 merges.

### Task 8: Cleanup

**Files:**

- Modify: `infra/cloudfront.tf` (drop `local.api_cutover`, the API Gateway origins and the switch; behaviors target `api-web` directly), `infra/api_rest_lambda.tf` (keep only the IAM role and its policies, which the Web Function uses; rename nothing), `infra/monitoring_alarms.tf`, `infra/main.tf`, `infra/README.md`
- Delete: `infra/api_rest.tf` (HTTP API, stage, routes, throttling, access logs), the `api` Event Function, its log group, `aws_lambda_alias.live`, `aws_lambda_permission.apigw`; alarms `api_http_5xx`, `api_http_latency_p95`, `api_http_throttled`, and the `api` entry in `monitored_lambda_log_groups`
- Modify: `apps/lambdas/api/src/index.ts` (only starts the server), `apps/lambdas/api/package.json` (drop `@hono/aws-lambda`), `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- Delete: `apps/lambdas/api/src/shared/redact-handle-event.ts` and its test, `apps/lambdas/api/src/index.logging.test.ts`, the adapter tests that go through `handler`
- Docs: `AGENTS.md`, `.github/instructions/backend.instructions.md`, `apps/lambdas/api/README.md`

- [ ] **Step 1:** `git grep -n "aws_apigatewayv2_api.this\|aws_lambda_function.api\b\|aws_lambda_alias.live"` in `infra/` lists every reference; remove each with its resource. The WebSocket API stays.
- [ ] **Step 2:** Port tests that need a request through the real stack from `handler` + `apiGatewayEvent` to `server.test.ts`-style requests against `startServer` on a random port (cookies, gzip, base64 webhook bodies become plain bodies). Delete `apiGatewayEvent`.
- [ ] **Step 3:** api suite, typecheck, lint, prettier, build; `terraform fmt -check`, `terraform validate`. `git grep -n "hono/aws-lambda\|APIGatewayProxy" -- apps/lambdas/api/src` returns nothing.
- [ ] **Step 4:** Commits: `refactor: serve the api only from the web function` (app) and `chore: remove the http api and the api event function` (infra).
- [ ] **Step 5 (owner):** `terraform plan` shows only deletions plus the behavior and origin changes in CloudFront; apply; the app, sign-in and a webhook redelivery work.
