---
name: new-domain
description: 'Scaffold a new backend domain (feature module) in the GitGazer AWS Lambda API under apps/lambdas/api/src/domains/. Use when adding a new REST resource, feature area, or set of API endpoints. Covers the routes/controller/middleware/test file layout, registering the Hono router in the app, the middleware chain, role-based access with requireRole, RLS-scoped data access via withRlsTransaction, and the @/ and @gitgazer/db/* import conventions.'
license: MIT
---

# New Backend Domain — GitGazer

Scaffold a new feature module in the Lambda API following the project's controller-centric domain layout. Each domain is a self-contained folder under [apps/lambdas/api/src/domains/](../../../apps/lambdas/api/src/domains/).

## When to Use

- Adding a new REST resource or feature area (e.g. `/api/<thing>`)
- Grouping a set of related endpoints + business logic + tests

Not for: a single extra route on an existing resource (just add it to that domain's `*.routes.ts`).

## File Layout

Create `apps/lambdas/api/src/domains/<domain>/` with:

| File                          | Purpose                                                          | Template                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `<domain>.routes.ts`          | HTTP endpoints on a `Hono<AppEnv>` router                        | [assets/domain.routes.template.ts](./assets/domain.routes.template.ts)                                          |
| `<domain>.routes.test.ts`     | Route tests through `testRequest` (controller mocked)            | [assets/domain.routes.test.template.ts](./assets/domain.routes.test.template.ts)                                |
| `<domain>.controller.ts`      | Business logic + RLS-scoped DB access                            | [assets/domain.controller.template.ts](./assets/domain.controller.template.ts)                                  |
| `<domain>.controller.test.ts` | Vitest unit tests (AWS + DB mocked)                              | [assets/domain.controller.test.template.ts](./assets/domain.controller.test.template.ts)                        |
| `<domain>.middleware.ts`      | _Optional_ — only if the domain needs request-context middleware | see [integrations.middleware.ts](../../../apps/lambdas/api/src/domains/integrations/integrations.middleware.ts) |

Reference implementations to copy patterns from: [apps/lambdas/api/src/domains/metrics/](../../../apps/lambdas/api/src/domains/metrics/) (read-only routes) and [apps/lambdas/api/src/domains/notifications/](../../../apps/lambdas/api/src/domains/notifications/) (role-gated writes).

## Procedure

1. **Create the folder and files** from the templates above. Rename `things` / `Thing` to your resource.

2. **Register the router** in `createApiRouter()` in [apps/lambdas/api/src/app.ts](../../../apps/lambdas/api/src/app.ts). Its paths are relative to `/api` (`/things` is served as `/api/things`):

    ```ts
    import thingsRoutes from '@/domains/things/things.routes';
    // ...inside createApiRouter(), with the other api.route calls:
    api.route('/', thingsRoutes);
    ```

    The global middleware chain (`compress` → `setContentLength` → `cors` → `authenticate` → `originCheck`) is applied by `createApp` — do **not** re-add it per domain. Routes that must skip authentication go in a `publicPrefixes` export of the routes file, listed in [public-routes.ts](../../../apps/lambdas/api/src/shared/middleware/public-routes.ts).

3. **Write controllers** that wrap every tenant-scoped query in `withRlsTransaction` (see the `refactor` skill for the boundary rules). Default role is reader; pass `userName: gitgazerWriter.name` for writes.

4. **Add tests** colocated as `*.test.ts`. Route tests call `testRequest(router, method, path, {appContext, cookies?, headers?, body?})` from [@/shared/hono/test-request](../../../apps/lambdas/api/src/shared/hono/test-request.ts), which mounts the router under `/api` behind the app's error and not-found handlers. Mock `@gitgazer/db/client` and all AWS clients — never hit real services.

5. **Verify**: `cd apps/lambdas/api && pnpm run test:unit && pnpm run lint`.

## Conventions (enforced — see [backend.instructions.md](../../instructions/backend.instructions.md))

- **Imports**: `@/` for `apps/lambdas/api/src`, `@gitgazer/db/*` for the shared package. **Never** `../../../`.
- **Auth context**: handlers read the authenticated user from `c.var.appContext`; add the `addUserIntegrationsToCtx` middleware from [integrations.middleware.ts](../../../apps/lambdas/api/src/domains/integrations/integrations.middleware.ts) to populate `appContext.integrations` / `integrationRoles`.
- **Authorization**: gate state-changing routes with `requireRole('admin' | 'owner' | ...)` from [@/shared/middleware/require-role](../../../apps/lambdas/api/src/shared/middleware/require-role.ts), after `addUserIntegrationsToCtx`. It reads the `:integrationId` path parameter.
- **Responses**: return `c.json(...)`; throw `BadRequestError` / `ForbiddenError` / `NotFoundError` / etc. from [@/shared/errors](../../../apps/lambdas/api/src/shared/errors.ts) for errors (details go in the second constructor argument).
- **Logging**: `getLogger()` from `@gitgazer/backend-core/logger` (AWS Powertools structured logging).
- **AWS clients**: import pre-configured clients from `@/shared/clients/` — never instantiate SDK clients in a controller.

## Checklist

- [ ] `<domain>.routes.ts` exports `default` a `Hono<AppEnv>` router and is registered via `api.route('/', ...)` in `createApiRouter()`
- [ ] All tenant-scoped DB access goes through `withRlsTransaction` with the correct role
- [ ] State-changing routes protected with `requireRole(...)`
- [ ] Inputs validated; errors thrown from `@/shared/errors`
- [ ] Colocated `*.test.ts`: routes through `testRequest`, controllers with `@gitgazer/db/client` + AWS mocked
- [ ] `pnpm run test:unit` and `pnpm run lint` pass
