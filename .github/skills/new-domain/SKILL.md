---
name: new-domain
description: 'Scaffold a new backend domain (feature module) in the GitGazer AWS Lambda API under apps/api/src/domains/. Use when adding a new REST resource, feature area, or set of API endpoints. Covers the routes/controller/middleware/test file layout, registering the router in the app, the AWS Powertools Router + middleware chain, role-based access with requireRole, RLS-scoped data access via withRlsTransaction, and the @/ and @gitgazer/db/* import conventions.'
license: MIT
---

# New Backend Domain — GitGazer

Scaffold a new feature module in the Lambda API following the project's controller-centric domain layout. Each domain is a self-contained folder under [apps/api/src/domains/](../../../apps/api/src/domains/).

## When to Use

- Adding a new REST resource or feature area (e.g. `/api/<thing>`)
- Grouping a set of related endpoints + business logic + tests

Not for: a single extra route on an existing resource (just add it to that domain's `*.routes.ts`).

## File Layout

Create `apps/api/src/domains/<domain>/` with:

| File                          | Purpose                                                          | Template                                                                                                |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `<domain>.routes.ts`          | HTTP endpoints on an AWS Powertools `Router`                     | [assets/domain.routes.template.ts](./assets/domain.routes.template.ts)                                  |
| `<domain>.controller.ts`      | Business logic + RLS-scoped DB access                            | [assets/domain.controller.template.ts](./assets/domain.controller.template.ts)                          |
| `<domain>.controller.test.ts` | Vitest unit tests (AWS + DB mocked)                              | [assets/domain.controller.test.template.ts](./assets/domain.controller.test.template.ts)                |
| `<domain>.middleware.ts`      | _Optional_ — only if the domain needs request-context middleware | see [integrations.middleware.ts](../../../apps/api/src/domains/integrations/integrations.middleware.ts) |

Reference implementation to copy patterns from: [apps/api/src/domains/integrations/](../../../apps/api/src/domains/integrations/).

## Procedure

1. **Create the folder and files** from the templates above. Rename `things` / `Thing` to your resource.

2. **Register the router** in [apps/api/src/shared/router/index.ts](../../../apps/api/src/shared/router/index.ts):

    ```ts
    import thingsRoutes from '@/domains/things/things.routes';
    // ...inside createApp(), with the other includeRouter calls:
    app.includeRouter(thingsRoutes);
    ```

    The global middleware chain (`compress` → `cors` → `authenticate` → `originCheck`) is applied by `createApp` — do **not** re-add it per domain.

3. **Write controllers** that wrap every tenant-scoped query in `withRlsTransaction` (see the `refactor` skill for the boundary rules). Default role is reader; pass `userName: gitgazerWriter.name` for writes.

4. **Add tests** colocated as `*.test.ts`. Mock `@gitgazer/db/client` and all AWS clients — never hit real services.

5. **Verify**: `cd apps/api && pnpm run test:unit && pnpm run lint`.

## Conventions (enforced — see [backend.instructions.md](../../../apps/api/.github/backend.instructions.md))

- **Imports**: `@/` for `apps/api/src`, `@gitgazer/db/*` for the shared package. **Never** `../../../`.
- **Auth context**: handlers receive `AppRequestContext`; use the `addUserIntegrationsToCtx` middleware to populate `reqCtx.appContext.integrations` / `integrationRoles`.
- **Authorization**: gate state-changing routes with `requireRole('admin' | 'owner' | ...)` from [@/shared/middleware/require-role](../../../apps/api/src/shared/middleware/require-role.ts).
- **Responses**: return a `Response` with `JSON.stringify(...)` and an `HttpStatusCodes` status; throw `BadRequestError` / `UnauthorizedError` / etc. from `@aws-lambda-powertools/event-handler/http` for errors.
- **Logging**: `getLogger()` from `@/shared/logger` (AWS Powertools structured logging).
- **AWS clients**: import pre-configured clients from `@/shared/clients/` — never instantiate SDK clients in a controller.

## Checklist

- [ ] `<domain>.routes.ts` exports `default` a `Router` and is registered via `app.includeRouter(...)`
- [ ] All tenant-scoped DB access goes through `withRlsTransaction` with the correct role
- [ ] State-changing routes protected with `requireRole(...)`
- [ ] Inputs validated; errors thrown as Powertools HTTP errors
- [ ] Colocated `*.test.ts` with `@gitgazer/db/client` + AWS mocked
- [ ] `pnpm run test:unit` and `pnpm run lint` pass
