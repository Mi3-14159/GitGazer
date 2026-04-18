---
sidebar_position: 8
title: Local Development Guide
description: How to run GitGazer locally for frontend and backend development.
---

# Local Development Guide

GitGazer supports flexible local development workflows. You can run the full stack locally (frontend + backend) or point the local frontend at the production API for frontend-only work.

## Prerequisites

Before you start, make sure you have:

- **Node.js 24+** — use [asdf](https://asdf-vm.com/) for version management
- **pnpm** — package manager (monorepo workspaces)
- **AWS CLI** configured with appropriate permissions
- **[aws-vault](https://github.com/99designs/aws-vault)** (recommended) for credential management

### Hosts File Entry

The frontend dev server runs on `app.gitgazer.localhost` for proper cookie handling and OAuth redirects. Add this entry to your hosts file:

```bash
# macOS / Linux
sudo nano /etc/hosts
# Add this line:
127.0.0.1 app.gitgazer.localhost
```

```powershell
# Windows (run as Administrator)
# Edit: C:\Windows\System32\drivers\etc\hosts
# Add: 127.0.0.1 app.gitgazer.localhost
```

## Development Scenarios

### Scenario 1: Full Local Development

**Use when**: You're developing both frontend and backend, or testing API changes locally.

#### 1. Configure the Frontend

Create `apps/web/.env.local`:

```bash
VITE_HOST_URL="https://app.gitgazer.localhost:5173"
VITE_COGNITO_DOMAIN="<COGNITO_DOMAIN>"
VITE_COGNITO_USER_POOL_ID="<USER_POOL_ID>"
VITE_COGNITO_USER_POOL_CLIENT_ID="<USER_POOL_CLIENT_ID>"
VITE_REST_API_ENDPOINT="https://app.gitgazer.localhost:5173/api"
VITE_IMPORT_URL_BASE="https://app.gitgazer.localhost:5173/api/import"
VITE_REST_API_REGION="us-east-1"
VITE_WEBSOCKET_API_ENDPOINT="<WEBSOCKET_ENDPOINT>"
```

The key setting is `VITE_REST_API_ENDPOINT` pointing to `localhost:5173/api` — this activates Vite's proxy to forward API requests to the local backend.

#### 2. Start the Backend

```bash
cd apps/api
pnpm install

# Copy and edit environment config
cp .env.dev.example .env
# Edit .env with your AWS configuration

# Start local backend (port 8080)
aws-vault exec <profile> --no-session -- pnpm run dev:api
```

#### 3. Start the Frontend

In a separate terminal:

```bash
cd apps/web
pnpm install
pnpm run dev
```

#### 4. Open the App

Navigate to `https://app.gitgazer.localhost:5173`.

:::warning[Self-signed certificate]
You'll see a browser warning about the self-signed SSL certificate. Click **Advanced → Proceed** to continue. This is expected for local development.
:::

#### How the Proxy Works

Vite's dev server intercepts requests to `/api` and forwards them to the local backend:

```
Browser → https://app.gitgazer.localhost:5173/api/integrations
       → Vite proxy intercepts /api/*
       → http://localhost:8080/api/integrations
       → Local Lambda dev server handles request
       → Response flows back through proxy
```

Because the frontend and API appear same-origin, cookies work seamlessly with no CORS issues.

---

### Scenario 2: Local Frontend + Production Backend

**Use when**: You're only developing frontend features and want to use real production data.

#### 1. Configure the Frontend

Create `apps/web/.env.local`:

```bash
VITE_HOST_URL="https://app.gitgazer.localhost:5173"
VITE_COGNITO_DOMAIN="<COGNITO_DOMAIN>"
VITE_COGNITO_USER_POOL_ID="<USER_POOL_ID>"
VITE_COGNITO_USER_POOL_CLIENT_ID="<USER_POOL_CLIENT_ID>"
VITE_REST_API_ENDPOINT="https://<GITGAZER_DOMAIN>/api"
VITE_IMPORT_URL_BASE="https://<GITGAZER_DOMAIN>/v1/api/import/"
VITE_REST_API_REGION="us-east-1"
VITE_WEBSOCKET_API_ENDPOINT="<WEBSOCKET_ENDPOINT>"
```

The key setting is `VITE_REST_API_ENDPOINT` pointing to the production domain — this bypasses the Vite proxy entirely.

#### 2. Start the Frontend

```bash
cd apps/web
pnpm install
pnpm run dev
```

No backend setup needed. All API calls go directly to production.

:::info[Production prerequisites]

- The production backend's `ALLOWED_FRONTEND_ORIGINS` must include `https://app.gitgazer.localhost:5173`.
- The Cognito app client must have `https://app.gitgazer.localhost:5173` as an allowed callback URL.
  :::

## Environment Variables

### Frontend Variables

| Variable                           | Full Local                                       | Hybrid (Prod Backend)                 | Description                 |
| ---------------------------------- | ------------------------------------------------ | ------------------------------------- | --------------------------- |
| `VITE_REST_API_ENDPOINT`           | `https://app.gitgazer.localhost:5173/api`        | `https://<DOMAIN>/api`                | REST API base URL           |
| `VITE_IMPORT_URL_BASE`             | `https://app.gitgazer.localhost:5173/api/import` | `https://<DOMAIN>/v1/api/import/`     | Webhook import base URL     |
| `VITE_HOST_URL`                    | `https://app.gitgazer.localhost:5173`            | `https://app.gitgazer.localhost:5173` | Frontend URL (same in both) |
| `VITE_COGNITO_DOMAIN`              | Cognito domain                                   | Cognito domain                        | Cognito auth domain         |
| `VITE_COGNITO_USER_POOL_ID`        | Pool ID                                          | Pool ID                               | Cognito user pool ID        |
| `VITE_COGNITO_USER_POOL_CLIENT_ID` | Client ID                                        | Client ID                             | Cognito app client ID       |
| `VITE_WEBSOCKET_API_ENDPOINT`      | WS endpoint                                      | WS endpoint                           | WebSocket API endpoint      |

### Backend Variables

Backend variables are configured in `apps/api/.env`. Copy from `.env.dev.example` and fill in your AWS configuration. Key variables:

| Variable                   | Description                        |
| -------------------------- | ---------------------------------- |
| `AWS_REGION`               | AWS region for all services        |
| `RDS_PROXY_ENDPOINT`       | RDS Proxy hostname                 |
| `RDS_DATABASE`             | Database name (`postgres`)         |
| `RDS_DB_USER`              | Database master username           |
| `CONFIG_SECRET_ARN`        | Secrets Manager ARN for app config |
| `ALLOWED_FRONTEND_ORIGINS` | Comma-separated allowed origins    |

## Database Access

Connect to Aurora PostgreSQL via SSM Session Manager port forwarding through the bastion host. No SSH keys or open inbound ports required.

### 1. Get the Port Forwarding Command

Terraform outputs the ready-to-use command:

```bash
cd infra
aws-vault exec <profile> -- terraform output bastion_ssm_port_forward_command
```

This returns a command like:

```bash
aws ssm start-session \
  --target i-0abc123def456 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<RDS_PROXY_ENDPOINT>"],"portNumber":["5432"],"localPortNumber":["5432"]}'
```

### 2. Start the Tunnel

Run the command from the Terraform output (wrapped with `aws-vault` for credentials):

```bash
aws-vault exec <profile> -- aws ssm start-session \
  --target <BASTION_INSTANCE_ID> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<RDS_PROXY_ENDPOINT>"],"portNumber":["5432"],"localPortNumber":["5432"]}'
```

You should see `Port 5432 opened for sessionId ...` — the tunnel is active. Keep this terminal open.

### 3. Connect

With the tunnel running, the database is available at `localhost:5432`. Open Drizzle Studio in a separate terminal:

```bash
cd apps/api
npx drizzle-kit studio
```

Or connect with any PostgreSQL client using `localhost:5432` and the credentials from your `.env` file.

## Running Tests

```bash
cd apps/api
pnpm run test:unit
```

Tests use Vitest and mock all AWS services — they never call real APIs.

## Troubleshooting

### Cannot Connect to API (Local Backend)

1. Verify the backend is running: `lsof -i :8080`
2. Check `.env.local` has `VITE_REST_API_ENDPOINT="https://app.gitgazer.localhost:5173/api"`
3. Restart both frontend and backend

### CORS Error (Production Backend)

1. Verify production `ALLOWED_FRONTEND_ORIGINS` includes `https://app.gitgazer.localhost:5173`
2. Clear browser cookies for `gitgazer` domains
3. Try incognito mode

### Authentication Redirect Fails

1. Confirm `app.gitgazer.localhost` is in your hosts file
2. Verify Cognito has `https://app.gitgazer.localhost:5173` as an allowed callback URL
3. Ensure `VITE_HOST_URL="https://app.gitgazer.localhost:5173"` in `.env.local`
4. Clear all cookies and try again

### Backend Won't Start

1. Verify AWS credentials: `aws-vault exec <profile> -- aws sts get-caller-identity`
2. Check `.env` has the correct `AWS_REGION`
3. Ensure your IAM role has permissions for RDS, Secrets Manager, SQS, and KMS

### Port Already in Use

```bash
# Find and kill the process on the port
lsof -i :5173  # frontend
lsof -i :8080  # backend
kill -9 <PID>
```
