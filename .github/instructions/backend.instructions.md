---
applyTo: '{apps/lambdas,packages/backend-core,packages/backend-services,packages/github-import}/**/*.{ts,json}'
---

# Backend Development Instructions

The backend is one Nx app per Lambda under `apps/lambdas/<name>/`, sharing code through
`packages/backend-core` (config, logger, AWS/GitHub clients), `packages/backend-services`
(event log, alerting, org member sync) and `packages/github-import` (webhook importers).

## Build and Test Commands

```bash
cd apps/lambdas/api   # or worker, backfill-worker, websocket, org-sync-scheduler, http-proxy

# Install dependencies
pnpm install

# Run unit tests
pnpm run test:unit

# Build and package this Lambda
pnpm run build  # tsup bundles into tmp/, the zip lands in dist/

# Local development (requires AWS credentials)
pnpm run dev:api

# Linting and formatting
pnpm run lint
pnpm run lint:fix
pnpm run pretty
```

## Architecture Patterns

### Path Aliases

- Always use `@/` prefix for imports within an app (maps to that app's `src/`)
- Use `@gitgazer/backend-core/*`, `@gitgazer/backend-services/*` and `@gitgazer/github-import` for shared backend code
- Use `@gitgazer/db/*` for imports from the shared `packages/db` package
- Inside a shared package, import its own modules relatively — never through its own alias
- Configured in `tsconfig.json`, `tsup.config.ts` and `vitest.config.mts`
- Never use relative imports like `../../../` across project boundaries - always use path aliases

### Router Pattern

- The api app is a [Hono](https://hono.dev) app built by `createApp()` in `apps/lambdas/api/src/app.ts`; `src/index.ts`
  wraps it for API Gateway with `@hono/aws-lambda`, and `src/server.ts` serves it over HTTP, running each request
  under its own child logger (`runWithRequestLogger`) because it serves requests concurrently
- Routes defined per domain in `src/domains/<domain>/<domain>.routes.ts` as a `new Hono<AppEnv>()` router
  (`AppEnv` from `@/shared/hono/env`) mounted in
  `createApiRouter()` in `src/app.ts` at its own path with `api.route('/<domain>', <router>)`, with route paths relative to that
  mount; `createApp()` serves that router under `/api`. A domain whose routes span several prefixes is mounted with
  `api.route('/', <router>)` and keeps its paths relative to `/api`
- Middleware chain: `compress` → `setContentLength` → `cors` → `authenticate` → `originCheck` → route handlers
- Handlers read the authenticated user from `c.var.appContext`. Add `addUserIntegrationsToCtx`
  (`@/domains/integrations/integrations.middleware`) to load `appContext.integrations` / `integrationRoles`, then
  `requireRole(...)` (`@/shared/middleware/require-role`) to gate a route on the `:integrationId` path parameter
- Throw errors from `@/shared/errors` (`BadRequestError`, `ForbiddenError`, `NotFoundError`, ...); the app
  turns them into `{statusCode, error, message, details?}` responses
- Routes that skip authentication are listed in each domain's `publicPrefixes` export, collected in
  `src/shared/middleware/public-routes.ts`

### AWS Service Clients

- Shared AWS clients live in `packages/backend-core/src/clients/`; api-only clients (`s3`, `ses`) stay in the api app
- Never instantiate AWS clients directly in controllers or routes
- Clients are pre-configured with region and credentials

### Database Access

- Use Drizzle ORM via `@gitgazer/db/client` for all database operations
- Use `withRlsTransaction` for row-level security scoped queries
- All table schemas defined in `packages/db/src/schema/`
- Follow existing patterns in `src/domains/`

### Error Handling

- Use structured logging with AWS Powertools Logger
- Log errors with context before throwing or returning error response
- Return appropriate HTTP status codes (400, 401, 403, 404, 500, 502)
- Include error details in response body for debugging

### Testing

- Unit tests: `*.test.ts` files alongside source
- Use Vitest as test runner
- Mock AWS services - never call real AWS APIs in tests
- Test file should mirror source structure

## Common Tasks

### Adding a New API Endpoint

1. Add the route to the domain's `src/domains/<domain>/<domain>.routes.ts` (for a new domain, use the `new-domain` skill)
2. Mount a new domain router in `createApiRouter()` in `src/app.ts` with `api.route('/<domain>', <router>)`
3. Add tests; route tests use `testRequest(router, method, path, {appContext, cookies?, headers?, body?})` from
   `@/shared/hono/test-request`, which wraps the router in the app's error handlers; mount the router where `createApiRouter()` does, e.g.
   `new Hono<AppEnv>().route('/api/<domain>', router)`
4. Update schema/types in `packages/db/` if needed

### Adding a New Controller

1. Create controller in `src/domains/<domain>/`
2. Import AWS clients from `@gitgazer/backend-core/clients/`
3. Implement business logic with proper error handling
4. Add unit tests with mocked AWS services

### Working with RDS

- Use Drizzle ORM for database access via `@gitgazer/db/client`
- Use `withRlsTransaction` for row-level security scoped queries
- All table schemas defined in `packages/db/src/schema/`
- Follow existing patterns in `src/domains/`

### GitHub Webhook Handling

- Webhook validation via `verifyGithubSign` middleware in `apps/lambdas/api/src/domains/webhooks/webhooks.middleware.ts`
- GitHub events are enqueued by the api app and imported by `apps/lambdas/worker` via `@gitgazer/github-import`
- Store job data in RDS Aurora PostgreSQL
- Trigger notifications via Step Functions

## Development Environment

### Local Setup

- Requires AWS credentials configured
- Use `aws-vault` for secure credential management
- Create a repo-root `.env`; every app's dev script reads it
- Start local server: `pnpm run dev:api` from `apps/lambdas/api`; it runs `src/server.ts`, a Node HTTP server for the
  same Hono app the Lambda handler wraps, on `127.0.0.1:8080` (or `AWS_LAMBDA_HTTP_ENDPOINT`)

### Environment Variables

- `AWS_REGION`: AWS region for services
- `RDS_*`: RDS connection configuration
- `DB_POOL_MAX`: database pool size per process (default `1`)
- `S3_*`: S3 bucket names
- `COGNITO_*`: Cognito configuration
- See the repo-root `.env` for the full list

## Deployment

### Lambda Packaging

- `pnpm run build` bundles the app's entrypoint into `tmp/` and zips it to `dist/gitgazer-<name>.zip`
- tsup bundles all dependencies into a single file (except `@aws-sdk/*`, provided by Lambda runtime)
- Runtime npm packages belong in `devDependencies`: tsup externalizes `dependencies`, and nothing is installed next to the bundle
- The `upload` target (in `package.json` under `nx.targets`) only syncs `dist/` to `S3_BUCKET_LAMBDA_STORE`; the zip goes live when the infra workflow runs `terraform apply`

### Lambda Functions

One app per function under `apps/lambdas/`, each with a single `src/index.ts` entrypoint (the api app also has
`src/server.ts`, which serves the same app over HTTP for local development):

- **api**: REST API and webhook endpoints
- **websocket**: WebSocket connection management
- **worker**: webhook queue processing
- **backfill-worker**: historical GitHub data backfill
- **org-sync-scheduler**: scheduled organization membership sync
- **http-proxy**: egress proxy for IPv4-only targets

## Code Quality

### TypeScript

- Strict mode enabled
- Use explicit types, avoid `any`
- Path aliases configured for clean imports
- Node.js 24 target

### Linting

- ESLint with TypeScript plugin
- Run `pnpm run lint` before committing
- Auto-fix with `pnpm run lint:fix`

### Formatting

- Prettier for consistent code style
- Run `pnpm run pretty` to format code
- Configuration in `.prettierrc`

## Important Notes

- Always validate webhook signatures for security
- Use structured logging for better observability
- Mock AWS services in tests to avoid costs and side effects
- Follow existing patterns for consistency
- Keep Lambda functions small and focused
- Minimize cold start time (avoid heavy imports at top level)
