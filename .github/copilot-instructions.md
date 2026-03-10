# GitGazer Copilot Instructions

GitGazer is a GitHub workflow monitoring tool with notification system built on AWS serverless architecture.

## Important: Module-Specific Instructions

This repository uses targeted instruction files for different modules. When working on specific areas, **always consult**:

- **Backend**: See [apps/api/.github/backend.instructions.md](../apps/api/.github/backend.instructions.md) for Lambda development
- **Frontend**: See [apps/web/.github/frontend.instructions.md](../apps/web/.github/frontend.instructions.md) for Vue/Vuetify development
- **Infrastructure**: See [infra/.github/infrastructure.instructions.md](../infra/.github/infrastructure.instructions.md) for Terraform/AWS resources

These files provide detailed build commands, testing procedures, and module-specific patterns.

## Project Architecture

### Multi-Module Structure

This is a pnpm monorepo with `apps/` and `packages/` workspaces.

- **`apps/api/`**: AWS Lambda backend (TypeScript, Node.js 24)
    - API Lambda handler for REST endpoints and GitHub webhooks
    - WebSocket Lambda handler for real-time updates
    - Alerting Lambda handler for notification processing
    - Analytics Lambda handler for data aggregation
    - Custom router built on `@aws-lambda-powertools/event-handler/http`
    - Structured logging with AWS Powertools
- **`apps/web/`**: Vue 3 + Vuetify SPA frontend
    - Composition API with `<script setup>`
    - Pinia for state management
    - Real-time WebSocket updates
- **`packages/db/`**: Shared database schema and types (Drizzle ORM)
    - Drizzle schema definitions for all tables
    - Shared TypeScript types and query builders
- **`packages/import/`**: Backfill utility for importing historical GitHub Actions data
- **`infra/`**: AWS infrastructure as code (Terraform)
    - Serverless architecture (Lambda, API Gateway, RDS Aurora PostgreSQL)
    - Authentication with Cognito
    - CloudFront for global distribution

The backend serves as both API and GitHub webhook processor, while the frontend provides the monitoring dashboard.

## Key Development Patterns

### Backend (`apps/api/`)

- **Router Pattern**: Custom router (`@aws-lambda-powertools/event-handler/http`) in `src/router/index.ts` handles API Gateway events
- **Middleware Chain**: Sequential processing with `cors` → `compress` → `authenticate` → `verifyGithubSign` → route handlers
- **Path Aliases**: Use `@/` prefix (maps to `src/`) - configured in `tsconfig.json` and `vitest.config.ts`
    - **IMPORTANT**: Never use relative imports like `../../../` - always use `@/` path aliases
    - Use `@gitgazer/db/*` to import from the shared `packages/db` package
- **AWS Client Pattern**: Centralized clients in `src/clients/` (rds, s3, bedrock, websocket-connections)
- **Database**: Drizzle ORM via `@gitgazer/db` package, with `withRlsTransaction` for row-level security
- **Logging**: AWS Powertools Logger for structured logging
- **Multiple Lambdas**: Handlers in `src/handlers/` with a shared tsup build config

### Development Workflows

#### Backend Development

In order to run the backend locally, you need to have AWS credentials configured. We recommend using [aws-vault](https://github.com/99designs/aws-vault) for managing your AWS credentials securely.

```bash
cd apps/api
npm run dev:api  # Local development server on port 8080 with hot reload
npm run buildZip  # Build and package API + WebSocket Lambdas for deployment
npm run test:unit  # Run Vitest unit tests
```

**Output**: Zip files are created in `tmp/` directory (e.g., `tmp/gitgazer-api.zip`)

#### Frontend Development

```bash
cd apps/web
npm run dev  # Vite dev server with HMR on port 5173
npm run build  # Production build for S3 deployment
```

#### Environment Setup

- Backend: Uses `.env.dev` file for local development (loaded via `--env-file`)
- Frontend: Uses `.env.local` for environment variables (Vite convention)
- Required env vars documented in main README.md and module-specific instructions

### AWS Integration Patterns

#### Infrastructure Management

- All AWS resources defined in `infra/` directory
- Environment-specific deployments via Terraform workspaces
- Lambda deployment artifacts created by `buildZip` (e.g., `tmp/gitgazer-api.zip`)

#### Authentication Flow

- AWS Cognito with OAuth integration
- httpOnly cookies for secure session management
- JWT tokens verified by `authenticate` middleware
- Frontend uses cookie-based authentication (no client-side token storage)

#### Data Flow

1. GitHub webhooks → API Gateway → Lambda (import routes)
2. Webhook validation via `verifyGithubSign` middleware
3. GitHub events processed by controllers in `src/controllers/`
4. Job data stored in RDS Aurora PostgreSQL via Drizzle ORM
5. Notifications triggered via Step Functions

### Testing Conventions

- Unit tests: `*.test.ts` files alongside source
- Test runner: Vitest with custom configuration for path aliases
- Mock AWS services in tests, don't call real AWS APIs

### Code Organization

- **Controllers**: Business logic (`apps/api/src/controllers/`)
- **Routes**: HTTP endpoint definitions (`apps/api/src/router/routes/`)
- **Clients**: AWS service wrappers (`apps/api/src/clients/`)
- **Schema/Types**: Shared between all modules (`packages/db/src/`)

### Build and Deployment

- CI/CD via GitHub Actions with path-based triggers
- Backend: `apps/api/**` changes trigger Lambda deployment
- Frontend: `apps/web/**` changes trigger S3 sync
- Use `aws-vault` for local AWS credential management

## Common Tasks

**Add new API endpoint**: Create route in `apps/api/src/router/routes/`, add to router in `apps/api/src/router/index.ts`
**Debug webhook issues**: Check `verifyGithubSign.ts` middleware and integration secrets in the database
**Local testing**: Use `apps/api/src/develop.ts` to simulate API Gateway events locally

Focus on serverless patterns, proper error handling with structured logging (AWS Powertools Logger), and maintaining type safety across the shared type system.

## Working with GitHub Copilot Agent

### Issue Guidelines

When creating or working on issues for this repository:

1. **Be Specific**: Clearly state the problem, desired outcome, and acceptance criteria
2. **Provide Context**: Reference relevant files, functions, or modules
3. **Include Examples**: Show expected behavior or error messages when applicable
4. **Scope Appropriately**: Keep issues focused on single features or bugs
5. **List Dependencies**: Mention if the issue requires other tasks to be completed first

### Good Task Examples

✅ **Good**: "Add email validation to the notification rule form in the frontend. The email field should validate against standard email regex and show an error message if invalid."

✅ **Good**: "Fix bug where webhook signature verification fails for payloads over 1MB. See `verifyGithubSign.ts` middleware in backend."

✅ **Good**: "Add unit tests for the WorkflowJobEvent type guard in the db package. Test valid payloads and edge cases."

❌ **Avoid**: "Make the app better" (too vague)

❌ **Avoid**: "Rewrite the entire authentication system" (too broad)

### Suitable Tasks for Copilot Agent

Copilot Agent works best on:

- Adding new API endpoints or routes
- Creating or updating Vue components
- Writing unit tests for existing code
- Updating documentation
- Fixing bugs with clear reproduction steps
- Adding type definitions and type guards
- Implementing form validation
- Refactoring for code quality improvements

### Tasks Requiring Human Review

Always have a human review tasks involving:

- Security-sensitive code (authentication, authorization, encryption)
- Infrastructure changes (Terraform resources)
- Database schema modifications
- API contract changes affecting multiple clients
- Performance-critical code paths

## Code Quality Standards

### Testing Requirements

- All new functions should have unit tests
- Tests should be in `*.test.ts` files alongside source
- Mock external dependencies (AWS services, APIs)
- Aim for high coverage of business logic

### Security Practices

- Never commit secrets or credentials
- Validate all external input with type guards
- Use parameterized queries for databases
- Implement proper authentication/authorization
- Keep dependencies updated (see Dependabot PRs)

### Performance Considerations

- Minimize Lambda cold start time
- Use lazy loading in frontend routes
- Implement proper caching strategies
- Optimize bundle sizes
- Use efficient RDS queries (avoid full table scans)

## Getting Help

- Check module-specific instruction files for detailed guidance
- Review existing code for patterns and conventions
- Consult AWS documentation for service-specific questions
- See main README.md for setup and deployment instructions
