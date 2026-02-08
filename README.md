# GitGazer

<p align="center">
   <img src="./docs/logo.png" alt="GitGazer Logo" width="200" height="auto">
</p>

GitGazer is a comprehensive monitoring and notification system for GitHub workflows, built on AWS serverless architecture. It provides real-time workflow status updates, a powerful dashboard for monitoring, and customizable notification rules for workflow events.

**Demo**: <https://app.gitgazer.com/>

## Features

- 📊 **Real-time Dashboard**: Monitor GitHub workflow status across repositories
- 🔔 **Smart Notifications**: Configure rules to get notified about workflow failures or status changes
- 🔗 **GitHub Integration**: Seamless webhook integration with GitHub repositories and organizations
- 🚀 **Serverless Architecture**: Built on AWS Lambda, API Gateway, and DynamoDB for scalability
- 📈 **Analytics**: Track workflow performance and trends over time
- 🔐 **Secure Authentication**: AWS Cognito with GitHub OAuth integration

## Architecture

### Multi-Module Structure

- **`02_central/`**: AWS Lambda backend (TypeScript, Node.js 24)
  - API handler for REST endpoints
  - Alerting handler for notifications
  - WebSocket handler for real-time updates
  - Analytics handler for data aggregation
- **`04_frontend/`**: Vue 3 + Vuetify SPA
- **`common/`**: Shared TypeScript types and utilities
- **`infra/`**: Terraform infrastructure as code

### Technology Stack

**Backend**:

- Node.js 24
- TypeScript
- AWS Lambda
- DynamoDB
- S3
- API Gateway (REST + WebSocket)

**Frontend**:

- Vue 3 (Composition API)
- Vuetify 3
- Pinia (state management)
- Vite
- Authentication via httpOnly cookies

**Infrastructure**:

- Terraform
- AWS Cognito
- CloudFront
- Route53
- Step Functions

## Prerequisites

- Node.js 24+ (recommended: use [asdf](https://asdf-vm.com/) for version management)
- AWS account with appropriate permissions
- Terraform ~> 1.0
- AWS CLI configured
- [aws-vault](https://github.com/99designs/aws-vault) (recommended for credential management)

## Installation

### Deployment Steps

Follow these steps to deploy GitGazer to your AWS account:

1. [Create the S3 bucket for Lambda artifacts](#1-create-s3-bucket-for-lambda-artifacts)
2. [Build and upload Lambda functions](#2-build-and-upload-lambda-functions)
3. [Deploy infrastructure with Terraform](#3-deploy-infrastructure)
4. [Build and deploy frontend](#4-build-and-deploy-frontend)
5. [Configure application](#5-configure-application)

### 1. Create S3 Bucket for Lambda Artifacts

```bash
cd infra
terraform init
terraform apply -target module.lambda_store
```

### 2. Build and Upload Lambda Functions

```bash
cd 02_central
npm ci

# Build and upload API Lambda
npm run buildZip:api
aws s3 cp ./tmp/gitgazer-api.zip s3://<S3_BUCKET_LAMBDA_STORE>/gitgazer-api.zip

# Build and upload Alerting Lambda
npm run buildZip:alerting
aws s3 cp ./tmp/gitgazer-alerting.zip s3://<S3_BUCKET_LAMBDA_STORE>/gitgazer-alerting.zip

# Build and upload WebSocket Lambda
npm run buildZip:websocket
aws s3 cp ./tmp/gitgazer-websocket.zip s3://<S3_BUCKET_LAMBDA_STORE>/gitgazer-websocket.zip
```

> **Note**: Replace `<S3_BUCKET_LAMBDA_STORE>` with the bucket name from step 1 output.

### 3. Deploy Infrastructure

```bash
cd ../infra
terraform apply
```

Review the plan carefully before confirming. Terraform will create:

- API Gateway (REST + WebSocket)
- Lambda functions
- DynamoDB tables
- S3 buckets
- Cognito user pool
- CloudFront distribution
- Route53 records
- And more...

### 4. Build and Deploy Frontend

First, create a `.env.local` file in the `04_frontend` directory with the values from Terraform outputs:

```bash
cd ../04_frontend
cat > .env.local << EOF
VITE_HOST_URL="http://localhost:5173"
VITE_COGNITO_DOMAIN="<COGNITO_DOMAIN>"
VITE_COGNITO_USER_POOL_ID="<USER_POOL_ID>"
VITE_COGNITO_USER_POOL_CLIENT_ID="<USER_POOL_CLIENT_ID>"
VITE_IMPORT_URL_BASE="https://<GITGAZER_DOMAIN>/v1/api/import/"
VITE_REST_API_REGION="<API_REGION>"
VITE_REST_API_ENDPOINT="https://<GITGAZER_DOMAIN>/api"
VITE_WEBSOCKET_API_ENDPOINT="<WEBSOCKET_ENDPOINT>"
EOF
```

Then build and deploy:

```bash
npm ci
npm run build

# Deploy to S3 with appropriate cache headers
aws s3 sync dist/. s3://<UI_BUCKET_NAME>/ --cache-control max-age=604800 --exclude "*.html"
aws s3 sync dist/. s3://<UI_BUCKET_NAME>/ --cache-control max-age=60 --include "*.html"
```

### 5. Configure Application

1. Navigate to your deployed application: `https://<GITGAZER_DOMAIN>/`
2. Sign in with GitHub OAuth
3. Go to the **Integrations** page and click **Add**
4. Copy the generated **Webhook payload URL** and **Secret**
5. Create a GitHub webhook:
   - For a [repository webhook](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks#creating-a-repository-webhook)
   - For an [organization webhook](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks#creating-an-organization-webhook)
   - Set **Payload URL** to the URL from step 4
   - Set **Content type** to `application/json`
   - Set **Secret** to the secret from step 4
   - Select **Workflow jobs** and **Workflow runs** events
6. (Optional) Create notification rules:
   - Go to **Notifications** page
   - Click **Add** and configure your notification preferences
   - Set filters for specific repositories, branches, or workflow statuses

## Development

### Local Development Setup

GitGazer supports flexible local development workflows. You can run the frontend against a local backend for full-stack development, or point it to production for frontend-only work.

**📖 [Complete Local Development Guide →](docs/local-development.md)**

The guide covers:

- Running frontend + backend locally (with Vite proxy)
- Running frontend against production backend
- Environment variable configuration for each scenario
- Troubleshooting common issues

#### Quick Start - Backend Development

```bash
cd 02_central

# Install dependencies
npm ci

# Configure environment (copy and edit)
cp .env.dev.example .env.dev

# Run local development server (runs on port 8080)
aws-vault exec <profile> --no-session -- npm run dev:api

# Run tests
npm run test:unit

# Lint and format
npm run lint
npm run pretty
```

#### Quick Start - Frontend Development

```bash
cd 04_frontend

# Install dependencies
npm ci

# Create .env.local with appropriate API endpoint
# For local backend: VITE_REST_API_ENDPOINT="https://app.gitgazer.local:5173/api"
# For production backend: VITE_REST_API_ENDPOINT="https://<GITGAZER_DOMAIN>/api"
# See docs/local-development.md for full configuration

# Start development server
npm run dev

# Lint and format
npm run lint
npm run pretty
```

### Project Structure

```text
GitGazer/
├── 02_central/          # Backend Lambda functions
│   ├── src/
│   │   ├── handlers/    # Lambda entry points
│   │   ├── router/      # API routing
│   │   ├── controllers/ # Business logic
│   │   ├── clients/     # AWS service clients
│   │   └── utils/       # Utility functions
│   └── scripts/         # Maintenance scripts
├── 04_frontend/         # Vue.js frontend
│   └── src/
│       ├── components/  # Reusable components
│       ├── views/       # Page components
│       ├── stores/      # Pinia stores
│       ├── router/      # Vue Router config
│       └── api/         # API client
├── common/              # Shared TypeScript types
│   └── src/types/       # Type definitions
├── infra/               # Terraform infrastructure
│   ├── *.tf            # Resource definitions
│   └── terraform.tfvars # Variables
└── docs/                # Documentation
```

### Module-Specific Documentation

For detailed development instructions, see:

- **Backend**: [02_central/.github/backend.instructions.md](02_central/.github/backend.instructions.md)
- **Frontend**: [04_frontend/.github/frontend.instructions.md](04_frontend/.github/frontend.instructions.md)
- **Common Types**: [common/.github/common.instructions.md](common/.github/common.instructions.md)
- **Infrastructure**: [infra/.github/infrastructure.instructions.md](infra/.github/infrastructure.instructions.md)

### Development Workflow

1. **Make changes** in your module
2. **Run tests** to verify functionality
3. **Lint and format** code
4. **Test locally** with development servers
5. **Build** for deployment
6. **Deploy** to AWS

### Common Development Tasks

#### Adding a New API Endpoint

1. Create route handler in `02_central/src/router/routes/`
2. Add route to router in `02_central/src/router/index.ts`
3. Add types to `common/src/types/index.ts` if needed
4. Write unit tests
5. Update frontend API client if consumed by UI

#### Adding a New Frontend Page

1. Create view component in `04_frontend/src/views/`
2. Add route in `04_frontend/src/router/`
3. Create/update Pinia store if needed
4. Add navigation link if appropriate

#### Updating Shared Types

1. Modify types in `common/src/types/index.ts`
2. Add/update type guards
3. Run `npm install` in dependent modules
4. Fix any type errors in backend and frontend

## Deployment

### Using aws-vault

We recommend using [aws-vault](https://github.com/99designs/aws-vault) for secure AWS credential management:

```bash
# Deploy backend
cd 02_central
aws-vault exec <profile> -- npm run buildZip:api
aws-vault exec <profile> -- aws s3 cp ./tmp/gitgazer-api.zip s3://...

# Deploy infrastructure
cd ../infra
aws-vault exec <profile> -- terraform apply

# Deploy frontend
cd ../04_frontend
aws-vault exec <profile> -- ./tmp/build-and-upload.sh
```

### CI/CD

The project uses GitHub Actions for automated deployments:

- Backend changes trigger Lambda function updates
- Frontend changes trigger S3 sync and CloudFront invalidation
- Infrastructure changes trigger Terraform deployments

## Monitoring and Operations

### CloudWatch Logs

All Lambda functions log to CloudWatch:

- `/aws/lambda/gitgazer-api`
- `/aws/lambda/gitgazer-alerting`
- `/aws/lambda/gitgazer-websocket`
- `/aws/lambda/gitgazer-analytics`

### Metrics

Monitor key metrics in CloudWatch:

- Lambda invocations, errors, duration
- API Gateway requests, latency, errors
- DynamoDB read/write capacity
- S3 bucket size and requests

### Troubleshooting

**Lambda cold starts**: Optimize by reducing dependencies and using provisioned concurrency
**API Gateway timeouts**: Check Lambda execution time and DynamoDB queries
**DynamoDB throttling**: Increase provisioned capacity or use on-demand billing
**Frontend errors**: Check browser console and CloudFront logs

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please follow the coding standards and include tests for new features.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/Mi3-14159/GitGazer/issues)
- **Demo**: <https://app.gitgazer.com/>

## Acknowledgments

Built with ❤️ using modern serverless technologies and best practices.

Need this as a change.
