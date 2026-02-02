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

## Quick Start

```bash
# Install dependencies
npm ci

# Create environment configuration
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

# Start development server
npm run dev

# Open browser to http://localhost:5173
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
