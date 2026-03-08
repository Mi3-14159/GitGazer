# 04_frontend - GitGazer Frontend

Vue 3 + Vuetify SPA frontend for GitGazer monitoring dashboard.

## Overview

Modern single-page application built with:

- **Vue 3**: Composition API with `<script setup>`
- **Vuetify 3**: Material Design component library
- **Pinia**: State management
- **Vue Router 4**: Client-side routing
- **Vite**: Fast build tool with HMR
- **Authentication**: httpOnly cookies with AWS Cognito
- **TypeScript**: Type safety

## Prerequisites

### Local Development Hostname

The development server is configured to run on `app.gitgazer.local` for proper cookie handling and OAuth redirects. You need to add this hostname to your system's hosts file.

**macOS/Linux:**

```bash
# Edit the hosts file with sudo
sudo nano /etc/hosts

# Add this line:
127.0.0.1 app.gitgazer.local
```

**Windows:**

```powershell
# Run as Administrator, edit:
# C:\Windows\System32\drivers\etc\hosts

# Add this line:
127.0.0.1 app.gitgazer.local
```

## Quick Start

```bash
# Install dependencies
npm ci

# Create environment configuration
cat > .env.local << EOF
VITE_HOST_URL="https://app.gitgazer.local:5173"
VITE_COGNITO_DOMAIN="<COGNITO_DOMAIN>"
VITE_COGNITO_USER_POOL_ID="<USER_POOL_ID>"
VITE_COGNITO_USER_POOL_CLIENT_ID="<USER_POOL_CLIENT_ID>"
VITE_IMPORT_URL_BASE="https://<GITGAZER_DOMAIN>/v1/api/import/"
VITE_REST_API_REGION="<API_REGION>"
VITE_REST_API_ENDPOINT="https://<GITGAZER_DOMAIN>/api"
VITE_WEBSOCKET_API_ENDPOINT="<WEBSOCKET_ENDPOINT>"
EOF

# Start development server
npm run dev

# Open browser to https://app.gitgazer.local:5173
# Note: You'll see a browser warning about the self-signed SSL certificate - this is expected for local development
```

## Build Commands

```bash
# Development server with HMR
npm run dev

# Build for production
npm run build

# Type checking
vue-tsc --noEmit

# Linting and formatting
npm run lint
npm run lint:fix
npm run pretty
```

## Development Scenarios

### Running Against Local Backend (Full Local Development)

When developing both frontend and backend, configure `.env.local` to use the Vite proxy:

```bash
VITE_REST_API_ENDPOINT="https://app.gitgazer.local:5173/api"
VITE_IMPORT_URL_BASE="https://app.gitgazer.local:5173/api/import"
```

The Vite dev server (configured in `vite.config.ts`) proxies `/api` requests to `http://localhost:8080` where the backend runs.

**Requirements:**

- Backend must be running: `cd ../02_central && aws-vault exec <profile> --no-session -- npm run dev:api`
- Backend runs on port 8080
- Proxy handles cookies and authentication automatically

### Running Against Production Backend (Frontend-Only Development)

When only developing frontend features, point directly to production:

```bash
VITE_REST_API_ENDPOINT="https://<GITGAZER_DOMAIN>/api"
VITE_IMPORT_URL_BASE="https://<GITGAZER_DOMAIN>/v1/api/import/"
```

Requests bypass the proxy and go directly to production via CORS.

**Requirements:**

- Production backend must include `https://app.gitgazer.local:5173` in `ALLOWED_FRONTEND_ORIGINS`
- Uses production data and authentication

**📖 For detailed setup, see [../docs/local-development.md](../docs/local-development.md)**

## Deployment

```bash
# Build the application
npm run build

# Deploy to S3 with cache headers
aws s3 sync dist/. s3://<UI_BUCKET_NAME>/ --cache-control max-age=604800 --exclude "*.html"
aws s3 sync dist/. s3://<UI_BUCKET_NAME>/ --cache-control max-age=60 --include "*.html"

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

For detailed development instructions, see [.github/frontend.instructions.md](.github/frontend.instructions.md).
