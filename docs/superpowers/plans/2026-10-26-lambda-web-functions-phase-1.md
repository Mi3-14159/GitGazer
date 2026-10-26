# api on Lambda Web Functions, phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get `api` ready for Lambda Web Functions while it keeps running behind the HTTP API: answer the platform
questions, take Cognito off the `execute-api` URL, move the app to Hono, make it safe for concurrent requests, give it
a real HTTP server entrypoint and run it on Arm64.

**Architecture:** Hono replaces the Powertools router domain by domain. During the migration a **temporary bridge**
runs both: Powertools stays the outer router with the global middleware (`compress`, `cors`, `authenticate`,
`originCheck`), and its not-found handler forwards every request it has no route for to the Hono app. When the last
domain has moved, Task 10 flips it: Hono becomes the only router, wrapped by `hono/aws-lambda` for the Lambda and by
`@hono/node-server` for local development and, in phase 2, the Web Function. The bridge exists only during phase 1;
the spec's anti-goal is a permanent translation layer.

**Tech Stack:** TypeScript, Node.js 24, Hono 4, `@hono/node-server`, Powertools Logger, Drizzle/`pg`, Vitest,
Terraform.

**Spec:** [docs/superpowers/specs/2026-10-26-lambda-web-functions-design.md](../specs/2026-10-26-lambda-web-functions-design.md)

## Global Constraints

- Every task ships to production on its own as its own PR, branched from a freshly fetched `origin/main`. `api` keeps
  running as an Event Function behind the HTTP API for all of phase 1.
- No functional changes to any endpoint: same paths, methods, status codes, JSON bodies, headers, cookies, redirects.
- Error bodies stay `{statusCode, error, message, details?}` (Powertools `HttpError.toJSON()`); unknown errors stay
  `500 {"statusCode":500,"error":"Internal Server Error","message":"Internal Server Error"}`; unmatched routes stay
  `404` with `NotFoundError` body `Route <path> for method <METHOD> not found`.
- CORS stays `origin: config.get('corsOrigins')`, `maxAge: 300`.
- Path aliases: `@/` inside the app, `@gitgazer/*` for packages; no relative cross-project imports.
- New dependencies go in the pnpm catalog (`pnpm-workspace.yaml`) and the app's `devDependencies` (tsup bundles
  them; see `tools/tsup-lambda.ts`). Pick versions published at least two weeks ago.
- Comments only for a non-obvious why. Keep code as simple as possible.
- Tests mock all AWS services and the DB; never call real AWS.
- Commit messages: one-line Conventional Commits, no body, no trailers.
- Before each PR: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:unit`, `pnpm run build` in
  `apps/lambdas/api`; `terraform fmt` and `terraform validate` in `infra/` for Terraform changes.

## Review Focus

1. **Several cookies in one response** (`/api/auth/callback`, `/api/auth/refresh`, `/api/auth/logout`): today the
   callback joins them into one `Set-Cookie` header with `, `. Each cookie must reach the browser separately, i.e. the
   Lambda result's `cookies` array has one entry per cookie. Test in Task 7.
2. **Webhook signatures over the raw body**, including bodies API Gateway delivers base64-encoded: the HMAC must run
   over the exact bytes GitHub signed, and the handler must still parse the JSON afterwards. Tests in Task 9.
3. **Compressed responses through the Lambda adapter**: a gzip response must come out with `isBase64Encoded: true`
   and a body that decodes. Test in Task 10.
4. **CORS preflight** (`OPTIONS` with `Origin` and `Access-Control-Request-Method`) for an allowed and a disallowed
   origin: same headers as today. Test in Task 10.
5. **Two users at the same time on one server**: neither sees the other's `appContext`, data or log keys. Test in
   Task 11.

---

### Task 1: Spike — answer the platform questions (throwaway)

Nothing from this task is merged except the appendix in the spec. Everything created in AWS is deleted at the end.

**Files:**

- Modify: `docs/superpowers/specs/2026-10-26-lambda-web-functions-design.md` (new section "Appendix: spike results")

- [ ] **Step 1:** Update the AWS CLI until `aws lambda-web help` works.
- [ ] **Step 2:** In a scratch directory outside the repo, write a ~30-line Hono app on `@hono/node-server` with
      routes: `POST /echo` (returns the body's SHA-256 and length), `GET /stream` (streams 10 chunks, 1 s apart),
      `GET /db` (connects to Aurora with IAM auth and runs `select 1`), `GET /info` (returns `process.env`
      keys, `process.arch`, uptime, a per-environment random id). Log one JSON line per request. On `SIGTERM`, log it.
- [ ] **Step 3:** Deploy it with `aws lambda-web deploy` in `eu-central-1` with the `api` VPC subnets, the Lambda
      security group, and a temporary role with DB connect and log permissions. Record the exact commands used.
- [ ] **Step 4:** Create a temporary CloudFront distribution with the endpoint as origin and origin access control.
- [ ] **Step 5:** Answer each spec question and record evidence (command + output) in the appendix:
    1. `curl -X POST --data @payload.json https://<cf>/echo` without `x-amz-content-sha256`: accepted or rejected?
       If rejected, test the fallback: endpoint without OAC + CloudFront origin custom header, checked by the app.
    2. `GET /db` returns `1`.
    3. Attach `LambdaInsightsExtension-Arm64` and the OTEL layer: does deploy accept layers, do they run?
    4. Logs: which log group, JSON preserved, log level config available?
    5. Packaging: can code come from `s3://<lambda store>/<key>` with an object version?
    6. Lifecycle: is there a startup phase before the first request (time from process start to first request in
       `/info`)? Does `SIGTERM` arrive? How long does an idle environment survive (call `/info` after 5, 15, 30, 60 min
       and compare the environment id)? Request timeout and maximum request/response size.
    7. Can auto deployment to the latest revision be set through the CLI/API?
    8. `curl -N https://<cf>/stream` prints chunks one per second, not all at the end.
    9. Can concurrency per environment be capped below 128? Fire 200 parallel requests at `/info` and count environment
       ids.
    10. Value format of `AWS_LAMBDA_HTTP_ENDPOINT`.
- [ ] **Step 6:** Delete the distribution, function, endpoint and temporary role. Verify with `aws lambda-web list`
      and `aws cloudfront list-distributions` that nothing is left.
- [ ] **Step 7:** Commit the appendix: `docs: add lambda web functions spike results`.

If question 1 needs the fallback, or layers don't work, stop and bring it to the owner before Task 10.

### Task 2: Point Cognito and URL fallbacks at CloudFront

**Files:**

- Modify: `infra/cognito.tf:27-29`
- Modify: `infra/secrets.tf` (`redirectUri`, `importUrlBase`)

- [ ] **Step 1:** In `cognito.tf`, set `token_url`, `attributes_url` and `jwks_uri` to
      `https://${local.app_domain}/api/auth/cognito/token`, `/api/auth/cognito/user` and `/api/auth/cognito/token`.
      Add `local.app_domain = try(var.custom_domain_config.domain_name, aws_cloudfront_distribution.this.domain_name)` in
      `infra/main.tf` next to the existing locals, and use it for `redirectUri`, `importUrlBase` and the existing
      `mcpServerUrl`, `installRedirectUri`, `signInRedirectUri` expressions.
- [ ] **Step 2:** Run `terraform plan`. Expected: `aws_cognito_identity_provider` shows `~ update in-place` with only
      the three URLs changing; `aws_secretsmanager_secret_version` for the Lambda config shows no value change for the
      production workspace (it has a custom domain). No resource is destroyed or replaced.
- [ ] **Step 3:** Commit: `fix: call the auth relay through cloudfront instead of execute-api`.
- [ ] **Step 4:** Note in the PR: apply in a quiet hour; afterwards sign in with GitHub once in a private window and
      confirm the login completes and `POST /api/auth/cognito/token` shows up in the API Gateway access logs with a 200.

### Task 3: Remove the unused secrets extension layer

**Files:**

- Modify: `infra/main.tf:42-47`

- [ ] **Step 1:** Confirm again that nothing calls it: `git grep -nE "2773|PARAMETERS_SECRETS" -- apps packages`
      returns no hits.
- [ ] **Step 2:** Remove `AWS-Parameters-and-Secrets-Lambda-Extension:21` from `local.lambda_layers`.
- [ ] **Step 3:** `terraform plan`: only `layers` changes on the Lambdas that used the list.
- [ ] **Step 4:** Commit: `chore: drop the unused secrets lambda extension`.

### Task 4: Hono foundation and bridge

**Files:**

- Modify: `pnpm-workspace.yaml` (catalog: `hono`, `@hono/node-server`)
- Modify: `apps/lambdas/api/package.json` (devDependencies)
- Create: `apps/lambdas/api/src/shared/hono/env.ts`
- Create: `apps/lambdas/api/src/shared/hono/app.ts`
- Create: `apps/lambdas/api/src/shared/hono/http-errors.ts`
- Create: `apps/lambdas/api/src/shared/hono/test-request.ts`
- Create: `apps/lambdas/api/src/shared/hono/require-role.ts`
- Modify: `apps/lambdas/api/src/domains/integrations/integrations.middleware.ts` (add Hono version)
- Modify: `apps/lambdas/api/src/shared/router/index.ts` (not-found bridge)
- Test: `apps/lambdas/api/src/shared/hono/app.test.ts`, `apps/lambdas/api/src/shared/hono/require-role.test.ts`

**Interfaces (produced):**

- `type AppEnv = {Bindings: {appContext?: AppContext; event?: LambdaEvent; lambdaContext?: LambdaContext}; Variables: {appContext?: AppContext}}` in `env.ts` (`LambdaEvent`, `LambdaContext` from `hono/aws-lambda`).
- `createHonoApp(): Hono<AppEnv>` in `app.ts`: copies `c.env.appContext` into `c.var.appContext` (bridge only),
  mounts the migrated domain routers, `onError` and `notFound` per the Global Constraints.
- `http-errors.ts` re-exports `HttpError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`,
  `NotFoundError`, `InternalServerError`, `ServiceUnavailableError`, `HttpStatusCodes` from Powertools. Migrated code
  imports errors only from `@/shared/hono/http-errors`; Task 10 swaps the implementation in this one file.
- `testRequest(app: Hono<AppEnv>, method: string, path: string, init?: {appContext?: AppContext; cookies?: string[]; headers?: Record<string, string>; body?: string | object}): Promise<Response>` in `test-request.ts`.
- `requireRole(minimumRole: MemberRole): MiddlewareHandler<AppEnv>` in `shared/hono/require-role.ts`, same checks
  and `authz` log lines as today; `action` is `` `${c.req.method} ${c.req.routePath}` ``.
- `addUserIntegrationsToCtxHono: MiddlewareHandler<AppEnv>` in `integrations.middleware.ts`, same behaviour as
  `addUserIntegrationsToCtx` on `c.var.appContext`. Task 10 renames it.

- [ ] **Step 1: Write the failing tests** in `app.test.ts`:
    - `it('returns the Powertools 404 body for an unknown route')`: `GET /api/nope` → status 404, JSON
      `{statusCode: 404, error: 'NotFoundError', message: 'Route /api/nope for method GET not found'}`.
    - `it('serializes thrown HttpErrors like Powertools')`: a test route throwing `new BadRequestError('x', {a: 1})` →
      400, `{statusCode: 400, error: 'BadRequestError', message: 'x', details: {a: 1}}`.
    - `it('hides unknown errors')`: route throwing `new Error('secret')` → 500 with the exact body from the Global
      Constraints, and the body does not contain `secret`.
    - `it('exposes the bridged appContext')`: `testRequest(..., {appContext: {userId: 7, ...}})` → route reads
      `c.var.appContext?.userId === 7`.
    - In `require-role.test.ts`, port every case of `shared/middleware/require-role.test.ts` to the Hono middleware.
- [ ] **Step 2:** Run `pnpm run test:unit -- src/shared/hono`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the files above. In `shared/router/index.ts` register
      `app.notFound(async (_error, reqCtx) => getHonoApp().fetch(reqCtx.req, {appContext: reqCtx.appContext, event: reqCtx.event, lambdaContext: reqCtx.context}))`,
      where `getHonoApp()` lazily builds and caches `createHonoApp()`. Powertools runs its global middleware before the
      not-found handler, so `authenticate`, `originCheck`, `cors` and `compress` keep applying to bridged routes.
- [ ] **Step 4:** Add a test in `src/index.test.ts` style that resolves an API Gateway v2 event for a route only the
      Hono app has (register a test-only router via `vi.mock`) through `createApp().resolve()` and gets its response,
      with the cookies from `authenticate` applied.
- [ ] **Step 5:** Run the full suite and `pnpm run build`. Expected: all PASS.
- [ ] **Step 6:** Commit: `feat: add hono app behind the powertools router`.

### Tasks 5–9: Migrate the domains

Each task moves its domains completely and ships on its own. The pattern is the same for every domain:

- In `<domain>.routes.ts`, replace `new Router()` with `new Hono<AppEnv>()`, keep the file name and default export,
  keep `publicPrefixes` exactly as is.
- Handlers take `c: Context<AppEnv>`. Replace `reqCtx.params.x` → `c.req.param('x')`,
  `event.queryStringParameters?.x` → `c.req.query('x')`, `event.headers['x']` → `c.req.header('x')`,
  `event.cookies` → the `Cookie` header split by `; ` (add `getRequestCookies(c): string[]` to
  `shared/helpers/cookies.ts` in the first task that needs it and reuse it), `event.body`/`isBase64Encoded` →
  `await c.req.text()` (Hono already decodes), `reqCtx.req.json()` → `await c.req.json()`,
  `reqCtx.appContext` → `c.var.appContext`, `routeKey` → `` `${c.req.method} ${c.req.routePath}` ``.
- Return `c.json(value)` where the handler returned a plain object, `c.json(body, status)` where it returned
  `{statusCode, body}`, and keep returned `Response` objects as they are.
- Controllers that take `APIGatewayProxyEventV2` get the specific values they use as parameters instead (e.g. the
  request origin as a string, the raw body as a string). No controller imports `aws-lambda` after its task.
- Route-level middleware becomes `MiddlewareHandler<AppEnv>`; use `requireRole` from `@/shared/hono/require-role` and
  `addUserIntegrationsToCtxHono`. Errors come from `@/shared/hono/http-errors`.
- Remove `app.includeRouter(<domain>)` from `shared/router/index.ts` and add `app.route('/', <domain>)` in
  `createHonoApp()`.
- Rewrite the domain's tests that build API Gateway events to use `testRequest`, keeping every assertion. Controller
  tests change only where a controller signature changed.
- Verification for every task: the domain's tests, the full suite, typecheck, lint, build. Then, after deploy, the
  domain's routes in the API Gateway access logs show no new 4xx/5xx pattern for a day before the next task merges.

### Task 5: Migrate overview, workflows, event-log, metrics

**Files:** `apps/lambdas/api/src/domains/{overview,workflows,event-log,metrics}/*.routes.ts`, their controllers where
they read events, `shared/router/index.ts`, `shared/hono/app.ts`, tests in those folders.

- [ ] **Step 1:** Write `metrics.routes.test.ts` with one test per route asserting status 200 and the controller
      receiving the query values, using `testRequest` (the three routes read `queryStringParameters` today).
- [ ] **Step 2:** Run it. Expected: FAIL (route not on Hono).
- [ ] **Step 3:** Migrate the four domains per the pattern.
- [ ] **Step 4:** Run the verification. Expected: PASS.
- [ ] **Step 5:** Commit: `refactor: move read-only api domains to hono`.

### Task 6: Migrate notifications, users, members

**Files:** `apps/lambdas/api/src/domains/{notifications,users,members}/`, `shared/router/index.ts`,
`shared/hono/app.ts`.

- [ ] **Step 1:** Port the event-building tests in `notifications.controller.test.ts`,
      `members.controller.test.ts` and `users.controller.test.ts` to `testRequest`. For the OAuth token parsing route in
      `users.routes.ts`, add `it('returns the parse status and body')` for a form-encoded body and for a base64 event body
      (bridge path through `createApp().resolve()` with `isBase64Encoded: true`).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Migrate the three domains; `parseOAuthTokenBody(body: string)` drops its `isBase64Encoded`
      parameter.
- [ ] **Step 4:** Verification. Expected: PASS.
- [ ] **Step 5:** Commit: `refactor: move notifications, users and members routes to hono`.

### Task 7: Migrate auth

**Files:** `apps/lambdas/api/src/domains/auth/`, `shared/helpers/cookies.ts`, `shared/router/index.ts`,
`shared/hono/app.ts`.

- [ ] **Step 1: Write the failing tests** in `auth.routes.test.ts`:
    - `it('sets each auth cookie as its own Set-Cookie header on callback')`: mock `handleOAuthCallback` to return
      three cookies; `response.headers.getSetCookie()` has 4 entries (3 + cleared state cookie), and through
      `createApp().resolve()` the API Gateway result's `cookies` array has 4 entries.
    - Same for `/api/auth/refresh` (success and failure) and `/api/auth/logout`.
    - `it('redirects with 302 and Location on login')`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Migrate; build responses with `headers.append('Set-Cookie', cookie)` per cookie, never a joined
      string.
- [ ] **Step 4:** Verification. Expected: PASS.
- [ ] **Step 5:** Commit: `refactor: move auth routes to hono`.

### Task 8: Migrate integrations, apps, slack, mcp

**Files:** `apps/lambdas/api/src/domains/{integrations,apps,slack,mcp}/`, `shared/router/index.ts`,
`shared/hono/app.ts`.

- [ ] **Step 1:** Port `integrations.routes.test.ts`, `apps.routes.test.ts`, `slack.routes.test.ts`,
      `mcp.routes.test.ts`, `mcp-oauth.controller.test.ts` and the event-based parts of the controller tests to
      `testRequest`. Add `it('keeps the MCP metadata documents unchanged')`: before migrating, capture the JSON of
      `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` for a request to
      `app.gitgazer.com` from the current implementation and assert the migrated routes return exactly that.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Migrate. `mcpServerUrl`, `mcpOrigin`, `protectedResourceMetadataUrl`, `buildAuthServerMetadata`,
      `handleAuthorize`, `handleCallback`, `handleToken` take `(origin: string, ...)` / `(body: string)` instead of the
      event. Keep the `run_sql` statement timeout untouched.
- [ ] **Step 4:** Verification. Expected: PASS.
- [ ] **Step 5:** Commit: `refactor: move integration, app, slack and mcp routes to hono`.

### Task 9: Migrate webhooks, github-app, fe-failover

**Files:** `apps/lambdas/api/src/domains/{webhooks,github-app}/`, `shared/router/feFailover.ts`,
`shared/router/index.ts`, `shared/hono/app.ts`.

- [ ] **Step 1: Write the failing tests:**
    - `webhooks.middleware.test.ts`: port every case; add `it('verifies the signature over the raw bytes and still lets the handler parse JSON')`
      with a body containing non-ASCII characters and whitespace that `JSON.stringify` would not reproduce.
    - `it('accepts a base64-encoded API Gateway body')`: through `createApp().resolve()` with `isBase64Encoded: true`,
      valid signature → 200.
    - Same two for `verifyGithubAppSignature` in `github-app.middleware.test.ts`.
    - `it('serves index.html for deep fe-failover paths')`: `GET /fe-failover/integrations/abc` → 200 with the mocked
      S3 body, content type and cache control; `GET /fe-failover/` → 404 as today.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Migrate. Signature middleware reads `await c.req.arrayBuffer()` for the HMAC; the handler uses
      `c.req.json()` (Hono caches the body). Failover route: `/fe-failover/:path{.+}`.
- [ ] **Step 4:** Verification. Expected: PASS. After deploy, watch `POST /api/import/{integrationId}` 2xx rate in the
      access logs and GitHub's recent deliveries for one day.
- [ ] **Step 5:** Commit: `refactor: move webhook and failover routes to hono`.

### Task 10: Flip to Hono and remove Powertools router

**Files:**

- Create: `apps/lambdas/api/src/app.ts`
- Modify: `apps/lambdas/api/src/index.ts`
- Modify: `apps/lambdas/api/src/shared/hono/http-errors.ts` (own implementation)
- Move: Hono middleware to `src/shared/middleware/` (`require-role.ts`, `authentication.ts`, `origin-check.ts`),
  `addUserIntegrationsToCtxHono` → `addUserIntegrationsToCtx`
- Delete: `src/shared/router/`, Powertools versions of middleware, `shared/hono/app.ts` (folded into `app.ts`)
- Modify: `packages/backend-core/src/types.ts`, `packages/backend-core/package.json`,
  `apps/lambdas/api/package.json` (drop `@aws-lambda-powertools/event-handler`)
- Test: `apps/lambdas/api/src/app.test.ts`, `apps/lambdas/api/src/index.test.ts`

**Interfaces (produced):**

- `createApp(): Hono<AppEnv>` in `src/app.ts`: `compress()`, `cors({origin: corsOrigins, maxAge: 300})`,
  `authenticate`, `originCheck`, then all domain routers, `onError`, `notFound`.
- `AppEnv` loses `Bindings.appContext`; `authenticate` sets `c.set('appContext', …)`.
- `AppContext` stays in `backend-core/types.ts`; `AppRequestContext` is deleted.
- `handler` in `index.ts`: `handle(app)` from `hono/aws-lambda`, wrapped to await init and keep the
  `redactHandleRouteBody` / `redactHandleRouteResult` logging.

- [ ] **Step 1: Write the failing tests** in `app.test.ts`:
    - Move the `app.test.ts` cases from Task 4 here, against `createApp()`.
    - `it('answers CORS preflight like before')`: `OPTIONS /api/integrations` with an allowed `Origin` and
      `Access-Control-Request-Method: POST` → `access-control-allow-origin` = that origin, `access-control-max-age` =
      `300`; with a disallowed origin → no `access-control-allow-origin`.
    - `it('gzips large responses and the Lambda result is base64')`: through `handler` with
      `accept-encoding: gzip` on a route returning >1 KB JSON → `isBase64Encoded: true`, body gunzips to the JSON.
    - `it('rejects state-changing requests from foreign origins')` and `it('skips auth on public prefixes')`: ported
      from the Powertools middleware tests.
    - Keep `index.test.ts`'s redaction test passing against the new handler.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `http-errors.ts` defines `HttpError` and the subclasses itself with the same
      `statusCode`, `errorType`, `toJSON()` and `toWebResponse()`; `HttpStatusCodes` becomes a local `const` object with
      the codes used. Port `authenticate` and `originCheck` to `MiddlewareHandler<AppEnv>` with `c.req.path` for
      `rawPath`.
- [ ] **Step 4:** `git grep -n "event-handler\|APIGatewayProxyEventV2\|reqCtx" -- apps/lambdas/api/src packages/backend-core/src`
      returns hits only in `index.ts` and `shared/redact-handle-event.ts` (Lambda event types for the handler). Verification: full suite, typecheck, lint, build, and
      `pnpm -r run typecheck` for the packages.
- [ ] **Step 5:** Commit: `refactor: serve the api with hono only`.

### Task 11: Concurrency safety and server entrypoint

**Files:**

- Modify: `packages/backend-core/src/logger.ts`
- Modify: `packages/db/src/client.ts:43-54`
- Create: `apps/lambdas/api/src/server.ts`
- Modify: `apps/lambdas/api/src/app.ts` (request-scoped logger middleware)
- Modify: `apps/lambdas/api/src/index.ts`
- Delete: `apps/lambdas/api/src/develop.ts`
- Modify: `apps/lambdas/api/package.json` (`dev:api`)
- Modify: `AGENTS.md`, `.github/instructions/backend.instructions.md`, `apps/lambdas/api/README.md` where they
  describe `develop.ts` or the dev server
- Test: `packages/backend-core/src/logger.test.ts`, `packages/db/src/client.test.ts`,
  `apps/lambdas/api/src/server.test.ts`

**Interfaces (produced):**

- `runWithRequestLogger<T>(keys: Record<string, string>, fn: () => Promise<T>): Promise<T>` in `logger.ts`: stores
  `logger.createChild({persistentKeys: keys})` in an `AsyncLocalStorage`; `getLogger()` returns the stored child when
  inside, the base logger otherwise. Log buffering is disabled when `AWS_LAMBDA_HTTP_ENDPOINT` is set, because the
  buffer is keyed by one trace id per process and a flush on error would dump other requests' lines.
- Pool size from `DB_POOL_MAX` (integer, default `1`); `connectionTimeoutMillis` stays 5000. The Event Function
  keeps 1; phase 2 sets the Web Function's value from the spike results.
- `initApp(): Promise<Hono<AppEnv>>` in `app.ts`: runs `initDb()`, `loadConfig()`, `createApp()` once and caches
  the promise. Used by `index.ts` and `server.ts`.
- `server.ts`: awaits `initApp()`, then `serve({fetch: app.fetch, hostname, port})` from `@hono/node-server`, with
  `hostname`/`port` parsed from `AWS_LAMBDA_HTTP_ENDPOINT` in the format the spike found, else `127.0.0.1:8080`. On
  `SIGTERM`, stop accepting, wait for in-flight requests, end the DB pool, exit.
- App middleware (first in the chain): `runWithRequestLogger({requestId: c.req.header('x-amzn-requestid') ?? crypto.randomUUID()}, next)`.

- [ ] **Step 1: Write the failing tests:**
    - `logger.test.ts`: `it('keeps keys of concurrent requests apart')`: two `runWithRequestLogger` calls with different
      `requestId`s, interleaved with `await` on timers, each logging; every captured line carries its own id.
    - `client.test.ts`: `it('sizes the pool from DB_POOL_MAX')` with `DB_POOL_MAX=10` → `pg.Pool` constructed with
      `max: 10`; unset → `max: 1`.
    - `server.test.ts`: `it('keeps two users apart under concurrency')`: start the server on a random port with
      `authenticate` mocked to set `appContext.userId` from a test header and a route that awaits 50 ms then returns
      `c.var.appContext.userId`; fire 50 interleaved requests for users 1 and 2; every response matches its own user.
    - `server.test.ts`: `it('runs init before accepting requests')` and `it('drains in-flight requests on SIGTERM')`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `withRlsTransaction` already uses `SET LOCAL`; leave it. Audit the remaining
      module-level state found during planning: `token-verifier.ts`
      verifiers, `bedrock.client.ts` signer and `webhooks.controller.ts` API client are stateless clients and safe to
      share; `db/client.ts` keeps one pool per process. Note any other finding in the PR.
- [ ] **Step 4:** `dev:api` becomes `node --env-file=.env --watch -r ts-node/register src/server.ts`; run it and
      call `GET /api/user` with a session cookie from the dev frontend. Expected: same response as before.
- [ ] **Step 5:** Verification: full suites of `api`, `backend-core` and `db`; build.
- [ ] **Step 6:** Commit: `feat: run the api as a concurrent http server`.

### Task 12: Arm64

**Files:**

- Modify: `infra/main.tf` (layer list per architecture)
- Modify: `infra/api_rest_lambda.tf` (`architectures`, layers)

- [ ] **Step 1:** Add `local.lambda_layers_arm64` with `LambdaInsightsExtension-Arm64` (the latest version in
      `eu-central-1`) and `AWSOpenTelemetryDistroJs:10`, both only when `enable_lambda_tracing` is on, mirroring
      `local.lambda_layers`.
- [ ] **Step 2:** On `aws_lambda_function.api`: `architectures = ["arm64"]`, `layers = local.lambda_layers_arm64`.
- [ ] **Step 3:** `terraform plan`: only `api` changes (`architectures`, `layers`); the zip and alias flow stay the
      same because the bundle is pure JavaScript.
- [ ] **Step 4:** After apply: CloudWatch shows no new errors for `api` for a day; p50 duration and init duration
      compared with the 30-day baseline in the spec (39 ms / 690 ms) are noted in the PR.
- [ ] **Step 5:** Commit: `feat: run the api lambda on arm64`.
