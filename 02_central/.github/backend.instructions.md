---
applyTo: '02_central/**/*.{ts,json}'
---

# Backend Development Instructions

This module contains the AWS Lambda backend for GitGazer, serving as both API and GitHub webhook processor.

## Build and Test Commands

```bash
cd 02_central

# Install dependencies
npm ci

# Run unit tests
npm run test:unit

# Build for different Lambda functions
npm run build:api         # API Gateway handler
npm run build:alerting    # Alerting handler
npm run build:websocket   # WebSocket handler
npm run build:analytics   # Analytics handler

# Build and package for deployment
npm run buildZip:api
npm run buildZip:alerting
npm run buildZip:websocket
npm run buildZip:analytics

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
- Configured in all `tsconfig.*.json` and `vitest.config.ts`
- Never use relative imports like `../../../` - always use path aliases

### Router Pattern

- Custom router in `src/router/router.ts` handles API Gateway Lambda events
- Routes defined in `src/router/routes/`
- Middleware chain: `lowercaseHeaders` → `extractCognitoGroups` → `verifyGithubSign` → route handlers
- Each route handler receives typed API Gateway event and context

### AWS Service Clients

- Centralized AWS clients in `src/clients/`
- Use existing client instances (DynamoDB, S3, Cognito, Athena, Firehose, etc.)
- Never instantiate AWS clients directly in controllers or routes
- Clients are pre-configured with region and credentials

### Type Guards

- All types from `common/types/index.ts` have corresponding `isType()` guards
- Always use type guards when validating external data
- Example: `isWorkflowJobEvent(data)` before processing
- Never assume data structure without validation

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

1. Create route handler in `src/router/routes/`
2. Add route to router in `src/router/index.ts`
3. Add corresponding tests
4. Update types in `common/types/` if needed

### Adding a New Controller

1. Create controller in `src/controllers/`
2. Import and use AWS clients from `src/clients/`
3. Implement business logic with proper error handling
4. Add unit tests with mocked AWS services

### Working with DynamoDB

- Use `DocumentClient` from `@aws-sdk/lib-dynamodb`
- All table names from environment variables
- Use TTL field `expire_at` for automatic cleanup
- Follow existing patterns in `src/controllers/`

### GitHub Webhook Handling

- Webhook validation via `verifyGithubSign` middleware
- GitHub events processed by controllers in `src/controllers/`
- Store job data in DynamoDB
- Trigger notifications via Step Functions

## Development Environment

### Local Setup

- Requires AWS credentials configured
- Use `aws-vault` for secure credential management
- Copy `.env.dev` file and configure environment variables
- Start local server: `npm run dev:api` (runs on port 8080)

### Environment Variables

- `AWS_REGION`: AWS region for services
- `DYNAMODB_*`: DynamoDB table names
- `S3_*`: S3 bucket names
- `COGNITO_*`: Cognito configuration
- See `src/develop.ts` for full list

## Deployment

### Lambda Packaging

- Build artifacts go to `dist/` directory
- Package includes `node_modules` (prod dependencies only)
- Zip files created in `tmp/` directory
- Upload to S3 bucket specified in infrastructure

### Multiple Lambda Functions

- **API**: Handles REST API and webhook endpoints (`src/handlers/api.ts`)
- **Alerting**: Processes notification rules (`src/handlers/alerting.ts`)
- **WebSocket**: Manages WebSocket connections (`src/handlers/websocket.ts`)
- **Analytics**: Aggregates workflow data (`src/handlers/analytics.ts`)

Each has separate:

- Build configuration: `tsconfig.*.json`
- Build script: `npm run build:<name>`
- Package script: `npm run buildZip:<name>`
- Output: `tmp/gitgazer-<name>.zip`

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
