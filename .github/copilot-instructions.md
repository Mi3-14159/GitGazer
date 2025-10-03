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
npm run dev  # Local development server on port 8080 with hot reload
npm run buildZip  # Build and package for Lambda deployment
npm run test  # Run Vitest unit tests
```

#### Frontend Development

```bash
cd 04_frontend
npm run dev  # Vite dev server with HMR
npm run build  # Production build for S3 deployment
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

## Common Tasks

**Add new API endpoint**: Create route in `src/router/routes/`, add to router in `src/router/index.ts`
**Add new notification channel**: Extend `NotificationRuleChannelType` enum in `common/types/`
**Debug webhook issues**: Check `verifyGithubSign.ts` middleware and integration secrets in DynamoDB
**Local testing**: Use `src/develop.ts` to simulate API Gateway events locally

Focus on serverless patterns, proper error handling with structured logging (`pino`), and maintaining type safety across the shared type system.
