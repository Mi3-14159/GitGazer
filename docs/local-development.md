# Local Development Guide

This guide explains how to run GitGazer's frontend locally against different API environments.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Development Scenarios](#development-scenarios)
  - [Scenario 1: Full Local Development (Frontend + Backend)](#scenario-1-full-local-development-frontend--backend)
  - [Scenario 2: Local Frontend + Production Backend](#scenario-2-local-frontend--production-backend)
- [Environment Variables Reference](#environment-variables-reference)
- [How the Proxy Works](#how-the-proxy-works)
- [Troubleshooting](#troubleshooting)

## Overview

GitGazer's frontend can be run in two primary development modes:

1. **Full Local**: Frontend proxies API requests to a locally-running backend (port 8080)
2. **Hybrid**: Frontend makes direct requests to the deployed production backend

The key to switching between these modes is configuring the `VITE_REST_API_ENDPOINT` and `VITE_IMPORT_URL_BASE` environment variables in your `.env.local` file.

## Prerequisites

### System Requirements

- Node.js 24+ (use [asdf](https://asdf-vm.com/) for version management)
- AWS CLI configured (required for backend development)
- [aws-vault](https://github.com/99designs/aws-vault) (recommended for credential management)

### Hosts File Configuration

The frontend development server runs on `app.gitgazer.local` for proper cookie handling and OAuth redirects. Add this to your hosts file:

**macOS/Linux:**

```bash
sudo nano /etc/hosts
# Add: 127.0.0.1 app.gitgazer.local
```

**Windows:**

```powershell
# Run as Administrator, edit: C:\Windows\System32\drivers\etc\hosts
# Add: 127.0.0.1 app.gitgazer.local
```

## Development Scenarios

### Scenario 1: Full Local Development (Frontend + Backend)

**Use this when**: You're developing both frontend and backend features simultaneously, or testing API changes locally.

#### Configuration

Create `04_frontend/.env.local`:

```bash
VITE_HOST_URL="https://app.gitgazer.local:5173"
VITE_COGNITO_DOMAIN="<COGNITO_DOMAIN>"
VITE_COGNITO_USER_POOL_ID="<USER_POOL_ID>"
VITE_COGNITO_USER_POOL_CLIENT_ID="<USER_POOL_CLIENT_ID>"
VITE_REST_API_ENDPOINT="https://app.gitgazer.local:5173/api"
VITE_IMPORT_URL_BASE="https://app.gitgazer.local:5173/api/import"
VITE_REST_API_REGION="us-east-1"
VITE_WEBSOCKET_API_ENDPOINT="<WEBSOCKET_ENDPOINT>"
```

**Key setting**: `VITE_REST_API_ENDPOINT` points to `https://app.gitgazer.local:5173/api`

#### How it Works

The frontend's Vite development server has a built-in proxy (see `vite.config.ts`):

```typescript
proxy: {
    '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
    },
}
```

**Request flow:**

1. Frontend makes request to `https://app.gitgazer.local:5173/api/integrations`
2. Vite proxy intercepts and forwards to `http://localhost:8080/api/integrations`
3. Local backend processes the request
4. Response flows back through proxy to frontend

**Benefits:**

- Same-origin for cookies (authentication works seamlessly)
- No CORS issues
- Fast iteration on both frontend and backend

#### Running - Full Local Development

**Terminal 1 - Backend:**

```bash
cd 02_central
npm ci

# Copy and configure environment
cp .env.dev.example .env.dev
# Edit .env.dev with your AWS configuration

# Start local backend (runs on port 8080)
aws-vault exec <profile> --no-session -- npm run dev:api
```

**Terminal 2 - Frontend:**

```bash
cd 04_frontend
npm ci

# Start frontend dev server (runs on port 5173)
npm run dev
```

**Access:** Open `https://app.gitgazer.local:5173` in your browser

- You'll see a browser warning about the self-signed SSL certificate - this is expected
- Click "Advanced" → "Proceed to app.gitgazer.local" (or equivalent in your browser)

### Scenario 2: Local Frontend + Production Backend

**Use this when**: You're only developing frontend features and want to use real production data.

#### Configuration - Production Backend

Create `04_frontend/.env.local`:

```bash
VITE_HOST_URL="https://app.gitgazer.local:5173"
VITE_COGNITO_DOMAIN="<COGNITO_DOMAIN>"
VITE_COGNITO_USER_POOL_ID="<USER_POOL_ID>"
VITE_COGNITO_USER_POOL_CLIENT_ID="<USER_POOL_CLIENT_ID>"
VITE_REST_API_ENDPOINT="https://<GITGAZER_DOMAIN>/api"
VITE_IMPORT_URL_BASE="https://<GITGAZER_DOMAIN>/v1/api/import/"
VITE_REST_API_REGION="us-east-1"
VITE_WEBSOCKET_API_ENDPOINT="<WEBSOCKET_ENDPOINT>"
```

**Key setting**: `VITE_REST_API_ENDPOINT` points to production domain

#### How the Production Connection Works

Requests bypass the Vite proxy and go directly to the production backend via CORS.

**Request flow:**

1. Frontend makes request to `https://app.gitgazer.com/api/integrations`
2. Request goes directly to production API Gateway
3. Production Lambda handles the request
4. Response returns with CORS headers

**Requirements:**

- Production backend must have `https://app.gitgazer.local:5173` in `ALLOWED_FRONTEND_ORIGINS`
- Cognito must allow the local URL as a callback URL

#### Running - Frontend Only

**Only Terminal - Frontend:**

```bash
cd 04_frontend
npm ci
npm run dev
```

**Access:** Open `https://app.gitgazer.local:5173` in your browser

**Note:** Backend is not required - all API calls go to production.

## Environment Variables Reference

### Frontend Variables

| Variable                           | Local Dev                                    | Hybrid                            | Description                   |
| ---------------------------------- | -------------------------------------------- | --------------------------------- | ----------------------------- |
| `VITE_REST_API_ENDPOINT`           | `https://app.gitgazer.local:5173/api`        | `https://<DOMAIN>/api`            | REST API endpoint             |
| `VITE_IMPORT_URL_BASE`             | `https://app.gitgazer.local:5173/api/import` | `https://<DOMAIN>/v1/api/import/` | Webhook import URL            |
| `VITE_HOST_URL`                    | `https://app.gitgazer.local:5173`            | `https://app.gitgazer.local:5173` | Frontend URL                  |
| `VITE_COGNITO_DOMAIN`              | Same for both                                | Same for both                     | Cognito authentication domain |
| `VITE_COGNITO_USER_POOL_ID`        | Same for both                                | Same for both                     | Cognito user pool ID          |
| `VITE_COGNITO_USER_POOL_CLIENT_ID` | Same for both                                | Same for both                     | Cognito app client ID         |
| `VITE_WEBSOCKET_API_ENDPOINT`      | Same for both                                | Same for both                     | WebSocket API endpoint        |

### Backend Variables

Backend variables are configured in `02_central/.env.dev` for local development. See [02_central/README.md](../02_central/README.md) for details.

Key variables:

- `AWS_REGION`: AWS region for services
- `DYNAMODB_*`: DynamoDB table names
- `S3_*`: S3 bucket names
- `ALLOWED_FRONTEND_ORIGINS`: Comma-separated list of allowed origins (must include `https://app.gitgazer.local:5173` for local dev)

## How the Proxy Works

The frontend's Vite development server includes a proxy configuration that intercepts requests to `/api` paths:

```typescript
// 04_frontend/vite.config.ts
server: {
    port: 5173,
    host: 'app.gitgazer.local',
    proxy: {
        '/api': {
            target: 'http://localhost:8080',
            changeOrigin: true,
            secure: false,
        },
    },
}
```

### When the Proxy is Active

The proxy **only activates** when:

1. Running the frontend dev server (`npm run dev`)
2. `VITE_REST_API_ENDPOINT` contains the frontend's own host (`app.gitgazer.local:5173`)

### When the Proxy is Bypassed

The proxy is **not used** when:

1. `VITE_REST_API_ENDPOINT` points to a different domain (e.g., production)
2. Building for production (`npm run build`)
3. Requests go to non-`/api` paths

### Cookie Handling

- **With proxy**: Cookies work seamlessly because frontend and API appear to be same-origin
- **Without proxy**: CORS requests; cookies require proper `SameSite` and `Domain` settings

## Troubleshooting

### "Cannot connect to API" with Local Backend

**Problem**: Frontend shows API connection errors when trying to use local backend.

**Solution**:

1. Verify backend is running: `ps aux | grep "npm run dev:api"`
2. Check backend is on port 8080: `lsof -i :8080`
3. Verify `.env.local` has `VITE_REST_API_ENDPOINT="https://app.gitgazer.local:5173/api"`
4. Check browser console for proxy errors
5. Restart both frontend and backend

### "Access-Control-Allow-Origin" Error with Production Backend

**Problem**: CORS errors when using production backend locally.

**Solution**:

1. Verify production backend's `ALLOWED_FRONTEND_ORIGINS` includes `https://app.gitgazer.local:5173`
2. Check that `.env.local` has the correct production domain in `VITE_REST_API_ENDPOINT`
3. Clear browser cache and cookies
4. Ensure you're logged in to production (not local cookies)

### Authentication Issues

**Problem**: Login redirects fail or cookies aren't set.

**Solution**:

1. Verify `app.gitgazer.local` is in your hosts file
2. Check Cognito app client has `https://app.gitgazer.local:5173` as allowed callback URL
3. Ensure `VITE_HOST_URL="https://app.gitgazer.local:5173"` in `.env.local`
4. Clear all browser cookies for `gitgazer.local` domain
5. Try in incognito/private browsing mode

### SSL Certificate Warning

**Problem**: Browser shows "Your connection is not private" warning.

**Solution**: This is expected for local development with self-signed certificates. Click "Advanced" and proceed to the site. The warning appears because Vite uses a self-signed certificate for HTTPS.

### Backend Won't Start

**Problem**: `npm run dev:api` fails with AWS credential errors.

**Solution**:

1. Verify AWS credentials: `aws sts get-caller-identity`
2. If using aws-vault: `aws-vault exec <profile> -- aws sts get-caller-identity`
3. Check `.env.dev` has correct AWS_REGION
4. Ensure DynamoDB tables exist in your AWS account
5. Verify IAM permissions for DynamoDB, S3, Cognito

### Hot Module Replacement Not Working

**Problem**: Changes to frontend code don't reflect immediately.

**Solution**:

1. Check terminal for Vite errors
2. Verify `node_modules` is up to date: `npm ci`
3. Clear Vite cache: `rm -rf node_modules/.vite`
4. Restart dev server
5. Hard refresh browser: Ctrl+Shift+R (Cmd+Shift+R on Mac)

### Port Already in Use

**Problem**: "Port 5173 is already in use" or "Port 8080 is already in use".

**Solution**:

```bash
# Find process using port 5173 (frontend)
lsof -i :5173
kill -9 <PID>

# Find process using port 8080 (backend)
lsof -i :8080
kill -9 <PID>
```

## Additional Resources

- [Frontend Development Instructions](../04_frontend/.github/frontend.instructions.md)
- [Backend Development Instructions](../02_central/.github/backend.instructions.md)
- [Main README](../README.md)
- [Infrastructure Documentation](../infra/README.md)

## Tips for Efficient Development

1. **Use two terminals**: One for backend, one for frontend
2. **Watch the logs**: Keep an eye on both terminal outputs for errors
3. **Browser DevTools**: Use Network tab to see which URL requests are going to
4. **aws-vault**: Prevents AWS credential issues: `aws-vault exec <profile> --no-session -- npm run dev:api`
5. **Hot reload**: Both Vite (frontend) and the backend dev server support hot reload
6. **Test locally first**: Catch issues early before deploying to production
