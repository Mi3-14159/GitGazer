---
applyTo: 'apps/api/**/*.{ts,json}'
---

# Backend Development Instructions

This module contains the AWS Lambda backend for GitGazer, serving as both API and GitHub webhook processor.

## Build and Test Commands

```bash
cd apps/api

# Install dependencies
npm ci

# Run unit tests
npm run test:unit

# Build and package all Lambda functions
npm run buildZip  # Builds API + WebSocket Lambdas, outputs to tmp/

# Local development (requires AWS credentials)
npm run dev:api

# Linting and formatting
npm run lint
npm run lint:fix
npm run pretty
```

## Architecture Patterns

### Path Aliases

- Always use `@/` prefix for imports (maps to `src/`)
- Example: `import { router } from '@/router'`
- Use `@gitgazer/db/*` for imports from the shared `packages/db` package
- Configured in `tsconfig.json` and `vitest.config.ts`
- Never use relative imports like `../../../` - always use path aliases

### Router Pattern

- Custom router (`@aws-lambda-powertools/event-handler/http`) in `src/shared/router/index.ts` handles API Gateway Lambda events
- Routes defined per domain in `src/domains/<domain>/<domain>.routes.ts`
- Middleware chain: `compress` → `cors` → `authenticate` → `originCheck` → route handlers
- Each route handler receives typed API Gateway event and context

### AWS Service Clients

- Centralized AWS clients in `src/shared/clients/`
- Available clients: `s3`, `websocket`, `secrets-manager`, `github-app`
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

1. Create route handler in `src/domains/<domain>/`
2. Add route to router in `src/shared/router/index.ts`
3. Add corresponding tests
4. Update schema/types in `packages/db/` if needed

### Adding a New Controller

1. Create controller in `src/domains/<domain>/`
2. Import and use AWS clients from `src/shared/clients/`
3. Implement business logic with proper error handling
4. Add unit tests with mocked AWS services

### Working with RDS

- Use Drizzle ORM for database access via `@gitgazer/db/client`
- Use `withRlsTransaction` for row-level security scoped queries
- All table schemas defined in `packages/db/src/schema/`
- Follow existing patterns in `src/domains/`

### GitHub Webhook Handling

- Webhook validation via `verifyGithubSign` middleware in `src/domains/webhooks/webhooks.middleware.ts`
- GitHub events processed by controllers in `src/domains/webhooks/`
- Store job data in RDS Aurora PostgreSQL
- Trigger notifications via Step Functions

## Development Environment

### Local Setup

- Requires AWS credentials configured
- Use `aws-vault` for secure credential management
- Copy `.env.dev.example` to `.env` and configure environment variables
- Start local server: `npm run dev:api` (runs on port 8080)

### Environment Variables

- `AWS_REGION`: AWS region for services
- `RDS_*`: RDS connection configuration
- `S3_*`: S3 bucket names
- `COGNITO_*`: Cognito configuration
- See `.env.dev.example` for full list

## Deployment

### Lambda Packaging

- Build artifacts go to `dist/` directory
- tsup bundles all dependencies into a single file (except `@aws-sdk/*`, provided by Lambda runtime)
- Zip files created in `tmp/` directory via `npm run buildZip`
- Upload to S3 bucket specified in infrastructure

### Lambda Functions

- **API**: Handles REST API and webhook endpoints (`src/handlers/api.ts`)
- **WebSocket**: Manages WebSocket connections (`src/handlers/websocket.ts`)

## Code Quality

### TypeScript

- Strict mode enabled
- Use explicit types, avoid `any`
- Path aliases configured for clean imports
- Node.js 24 target

### Linting

- ESLint with TypeScript plugin
- Run `npm run lint` before committing
- Auto-fix with `npm run lint:fix`

### Formatting

- Prettier for consistent code style
- Run `npm run pretty` to format code
- Configuration in `.prettierrc`

## Important Notes

- Always validate webhook signatures for security
- Use structured logging for better observability
- Mock AWS services in tests to avoid costs and side effects
- Follow existing patterns for consistency
- Keep Lambda functions small and focused
- Minimize cold start time (avoid heavy imports at top level)
