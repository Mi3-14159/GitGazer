# GitGazer Copilot Instructions

GitGazer is a GitHub workflow monitoring tool with notification system built on AWS serverless architecture.

## Project Architecture

### Multi-Module Structure

- **`02_central/`**: AWS Lambda backend (TypeScript, Node.js 22)
- **`04_frontend/`**: Vue 3 + Vuetify SPA frontend
- **`common/`**: Shared TypeScript types and utilities
- **`terraform/`**: AWS infrastructure as code

The backend serves as both API and GitHub webhook processor, while the frontend provides the monitoring dashboard.

## Key Development Patterns

### Backend (`02_central/`)

- **Router Pattern**: Custom router in `src/router/router.ts` handles API Gateway events
- **Middleware Chain**: Sequential processing with `lowercaseHeaders` → `extractCognitoGroups` → route handlers
- **Path Aliases**: Use `@/` prefix (maps to `src/`) - configured in `tsconfig.json` and `vitest.config.ts`
- **AWS Client Pattern**: Centralized clients in `src/clients/` (DynamoDB, S3, Cognito)
- **Type Guards**: All types in `common/types/index.ts` have corresponding `isType()` guards

### Development Workflows

#### Backend Development

In order to run the backend locally, you need to have AWS credentials configured. We recommend using [aws-vault](https://github.com/99designs/aws-vault) for managing your AWS credentials securely.

```bash
cd 02_central
npm run dev:api  # Local development server on port 8080 with hot reload
npm run buildZip:api  # Build and package API Lambda for deployment
npm run test:unit  # Run Vitest unit tests
npm run lint  # Check code style with ESLint
npm run pretty  # Format code with Prettier
```

#### Frontend Development

```bash
cd 04_frontend
npm run dev  # Vite dev server with HMR
npm run build  # Production build for S3 deployment
npm run lint  # Check code style with ESLint
npm run pretty  # Format code with Prettier
```

#### Environment Setup

- Backend: Uses `.env.dev` file for local development (loaded via `--env-file`)
- Frontend: Uses `.env.local` for environment variables (Vite convention)
- Required env vars documented in main README.md

### AWS Integration Patterns

#### Infrastructure Management

- All AWS resources defined in `terraform/` directory
- Environment-specific deployments via Terraform workspaces
- Lambda deployment artifact: `dist/lambda.zip` (created by `buildZip`)

#### Authentication Flow

- AWS Cognito with OAuth integration
- JWT tokens in API Gateway authorizer context
- Group-based authorization via `extractCognitoGroups` middleware
- Frontend uses AWS Amplify for auth state management

#### Data Flow

1. GitHub webhooks → API Gateway → Lambda (import routes)
2. Webhook validation via `verifyGithubSign` middleware
3. GitHub events processed by controllers in `src/controllers/`
4. Job data stored in DynamoDB with TTL (`expire_at` field)
5. Notifications triggered via Step Functions

### Testing Conventions

- Unit tests: `*.test.ts` files alongside source
- Test runner: Vitest with custom configuration for path aliases
- Mock AWS services in tests, don't call real AWS APIs

### Linting and Formatting

#### Backend and Frontend
- **ESLint**: TypeScript linting with strict rules
  - Backend: `npm run lint` (check), `npm run lint:fix` (auto-fix)
  - Frontend: `npm run lint` (check), `npm run lint:fix` (auto-fix)
- **Prettier**: Code formatting with consistent style
  - Backend: `npm run pretty`
  - Frontend: `npm run pretty`
  - Config highlights: single quotes, 4-space tabs (2 for JSON), 150 char line width, trailing commas

#### Style Preferences
- Use single quotes for strings
- Semicolons required
- Arrow function parentheses always included
- 4 spaces for indentation (TypeScript/JavaScript)
- 2 spaces for JSON files
- Prefer `const` over `let`

### Code Organization

- **Controllers**: Business logic (`src/controllers/`)
- **Routes**: HTTP endpoint definitions (`src/router/routes/`)
- **Clients**: AWS service wrappers (`src/clients/`)
- **Types**: Shared between all modules (`common/src/types/`)

### Build and Deployment

- CI/CD via GitHub Actions with path-based triggers
- Backend: `02_central/**` changes trigger Lambda deployment
- Frontend: `04_frontend/**` changes trigger S3 sync
- Use `aws-vault` for local AWS credential management

### Error Handling and Logging

- Use structured logging with `pino` logger (AWS Lambda Powertools)
- Log levels: debug, info, warn, error
- Include context in error logs (user IDs, request IDs, etc.)
- Catch and handle AWS service errors appropriately
- Return proper HTTP status codes in API responses

### Security Practices

- Never commit secrets or credentials to the repository
- Use AWS Secrets Manager for sensitive configuration
- Validate and sanitize all user inputs
- Use GitHub signature verification for webhooks (`verifyGithubSign` middleware)
- Implement proper CORS policies in API Gateway
- Use AWS Cognito for authentication and authorization
- Check user group membership before allowing privileged operations

## Common Tasks

**Add new API endpoint**: Create route in `src/router/routes/`, add to router in `src/router/index.ts`
**Add new notification channel**: Extend `NotificationRuleChannelType` enum in `common/types/`
**Debug webhook issues**: Check `verifyGithubSign.ts` middleware and integration secrets in DynamoDB
**Local testing**: Use `src/develop.ts` to simulate API Gateway events locally

## Dependency Management

- Use `npm ci` for clean installs in CI/CD and local setup
- Always update `package-lock.json` when adding/updating dependencies
- Backend uses Node.js 22, ensure compatibility
- Frontend uses Vue 3 and Vuetify 3
- Keep AWS SDK dependencies in sync across the project
- Review security advisories before adding new packages

Focus on serverless patterns, proper error handling with structured logging (`pino`), and maintaining type safety across the shared type system.
