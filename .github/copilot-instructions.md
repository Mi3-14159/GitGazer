# GitGazer Copilot Instructions

GitGazer is a GitHub workflow monitoring tool with notification system built on AWS serverless architecture.

## Important: Module-Specific Instructions

This repository uses targeted instruction files for different modules. When working on specific areas, **always consult**:

- **Backend**: See [02_central/.github/backend.instructions.md](../02_central/.github/backend.instructions.md) for Lambda development
- **Frontend**: See [04_frontend/.github/frontend.instructions.md](../04_frontend/.github/frontend.instructions.md) for Vue/Vuetify development
- **Infrastructure**: See [infra/.github/infrastructure.instructions.md](../infra/.github/infrastructure.instructions.md) for Terraform/AWS resources
- **Common Types**: See [common/.github/common.instructions.md](../common/.github/common.instructions.md) for shared TypeScript types

These files provide detailed build commands, testing procedures, and module-specific patterns.

## Project Architecture

### Multi-Module Structure

- **`02_central/`**: AWS Lambda backend (TypeScript, Node.js 24)
  - Four Lambda functions: API, Alerting, WebSocket, Analytics
  - Custom router with middleware chain
  - Structured logging with AWS Powertools
- **`04_frontend/`**: Vue 3 + Vuetify SPA frontend
  - Composition API with `<script setup>`
  - Pinia for state management
  - Real-time WebSocket updates
- **`common/`**: Shared TypeScript types and utilities
  - Type definitions with corresponding type guards
  - Single source of truth for shared types
- **`infra/`**: AWS infrastructure as code (Terraform)
  - Serverless architecture (Lambda, API Gateway, DynamoDB)
  - Authentication with Cognito
  - CloudFront for global distribution

The backend serves as both API and GitHub webhook processor, while the frontend provides the monitoring dashboard.

## Key Development Patterns

### Backend (`02_central/`)

- **Router Pattern**: Custom router in `src/router/router.ts` handles API Gateway events
- **Middleware Chain**: Sequential processing with `lowercaseHeaders` → `extractCognitoGroups` → `verifyGithubSign` → route handlers
- **Path Aliases**: Use `@/` prefix (maps to `src/`) - configured in all `tsconfig.*.json` and `vitest.config.ts`
  - **IMPORTANT**: Never use relative imports like `../../../` - always use `@/` path aliases
- **AWS Client Pattern**: Centralized clients in `src/clients/` (DynamoDB, S3, Cognito, Athena, Firehose)
- **Type Guards**: All types in `common/types/index.ts` have corresponding `isType()` guards
- **Logging**: AWS Powertools Logger for structured logging (not pino)
- **Multiple Lambdas**: Each Lambda has separate `tsconfig.*.json` and handler in `src/handlers/`

### Development Workflows

#### Backend Development

In order to run the backend locally, you need to have AWS credentials configured. We recommend using [aws-vault](https://github.com/99designs/aws-vault) for managing your AWS credentials securely.

```bash
cd 02_central
npm run dev:api  # Local development server on port 8080 with hot reload
npm run buildZip:api  # Build and package API Lambda for deployment
npm run buildZip:alerting  # Build and package Alerting Lambda
npm run buildZip:websocket  # Build and package WebSocket Lambda
npm run buildZip:analytics  # Build and package Analytics Lambda
npm run test:unit  # Run Vitest unit tests
```

**Output**: Zip files are created in `tmp/` directory (e.g., `tmp/gitgazer-api.zip`)

#### Frontend Development

```bash
cd 04_frontend
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
- Lambda deployment artifact: `dist/lambda.zip` (created by `buildZip`)

#### Authentication Flow

- AWS Cognito with OAuth integration
- httpOnly cookies for secure session management
- JWT tokens in API Gateway authorizer context
- Group-based authorization via `extractCognitoGroups` middleware
- Frontend uses cookie-based authentication (no client-side token storage)

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

✅ **Good**: "Add unit tests for the WorkflowJobEvent type guard in common module. Test valid payloads and edge cases."

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
- Use DynamoDB efficiently (avoid scans)

## Getting Help

- Check module-specific instruction files for detailed guidance
- Review existing code for patterns and conventions
- Consult AWS documentation for service-specific questions
- See main README.md for setup and deployment instructions
