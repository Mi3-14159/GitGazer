# apps/api - GitGazer Backend

AWS Lambda backend for GitGazer, serving as both API and GitHub webhook processor.

## Overview

This module contains multiple Lambda functions built with TypeScript and Node.js 24:

- **API Lambda**: REST API endpoints and GitHub webhook processing
- **Alerting Lambda**: Notification rule processing and delivery
- **WebSocket Lambda**: Real-time WebSocket connection management
- **Analytics Lambda**: Workflow data aggregation and analytics

## Quick Start

```bash
# Install dependencies
npm ci

# Configure environment
cp .env.dev.example .env.dev
# Edit .env.dev with your AWS configuration

# Run local development server (runs on port 8080)
aws-vault exec <profile> --no-session -- npm run dev:api

# Run tests
npm run test:unit
```

**Note:** When running the frontend locally (`cd ../web && npm run dev`), it can proxy API requests to this local backend server via Vite's built-in proxy. Configure the frontend's `.env.local` with `VITE_REST_API_ENDPOINT="https://app.gitgazer.local:5173/api"` to enable this. See [../../docs/local-development.md](../../docs/local-development.md) for details.

## Build Commands

```bash
# Build and package Lambda functions for deployment
npm run buildZip         # Creates tmp/gitgazer-api.zip and tmp/gitgazer-websocket.zip

# Local development
npm run dev:api              # Runs on port 8080 with hot reload

# Testing
npm run test:unit            # Run all unit tests

# Code quality
npm run lint                 # Check for linting errors
npm run lint:fix             # Auto-fix linting errors
npm run pretty               # Format code with Prettier
```

For detailed development instructions, see [.github/backend.instructions.md](.github/backend.instructions.md).
