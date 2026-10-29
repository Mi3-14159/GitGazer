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
VITE_REST_API_ENDPOINT="https://app.gitgazer.localhost:5173/api"
VITE_IMPORT_URL_BASE="https://app.gitgazer.localhost:5173/api/import"
VITE_WEBSOCKET_API_ENDPOINT="<WEBSOCKET_ENDPOINT>"
```

The key setting is `VITE_REST_API_ENDPOINT` pointing to `localhost:5173/api` — this activates Vite's proxy to forward API requests to the local backend.

#### 2. Start the Backend

```bash
pnpm install

# Create apps/lambdas/api/.env with your AWS configuration (see Backend Variables below).

# Start local backend (port 8080)
cd apps/lambdas/api
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
       → Local API server (the same Hono app the Lambda Web Function runs) handles request
       → Response flows back through proxy
```

Because the frontend and API appear same-origin, cookies work seamlessly with no CORS issues.

---

### Scenario 2: Local Frontend + Production Backend

**Use when**: You're only developing frontend features and want to use real production data.

#### 1. Configure the Frontend

Create `apps/web/.env.local`:

```bash
VITE_REST_API_ENDPOINT="https://<GITGAZER_DOMAIN>/api"
VITE_IMPORT_URL_BASE="https://<GITGAZER_DOMAIN>/api/import"
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
- The Cognito app client must allow `https://app.gitgazer.localhost:5173/api/auth/callback` as a callback URL.

Terraform sets both by default (`local.cors_allowed_origins` in `infra/main.tf`).

    :::

## Environment Variables

### Frontend Variables

| Variable                       | Full Local                                       | Hybrid (Prod Backend)         | Description                                  |
| ------------------------------ | ------------------------------------------------ | ----------------------------- | -------------------------------------------- |
| `VITE_REST_API_ENDPOINT`       | `https://app.gitgazer.localhost:5173/api`        | `https://<DOMAIN>/api`        | REST API base URL                            |
| `VITE_IMPORT_URL_BASE`         | `https://app.gitgazer.localhost:5173/api/import` | `https://<DOMAIN>/api/import` | Webhook import base URL (no trailing slash)  |
| `VITE_WEBSOCKET_API_ENDPOINT`  | WS endpoint                                      | WS endpoint                   | WebSocket API endpoint                       |
| `VITE_ENABLE_INVITATION_EMAIL` | `false` (optional)                               | `false` (optional)            | Show the invitation email option when `true` |

### Backend Variables

The API's `dev:api` script loads `apps/lambdas/api/.env` (`node --env-file=.env ...`). The worker and backfill worker dev scripts (`dev:worker`, `dev:backfill`) load a `.env` at the **repository root** (`node --env-file=../../../.env ...`). Key variables:

| Variable                   | Description                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_REGION`               | AWS region for all services                                                                                                                       |
| `RDS_HOST`                 | Database connection host                                                                                                                          |
| `RDS_HOSTNAME`             | Real hostname for IAM token signing                                                                                                               |
| `RDS_PORT`                 | Database connection port                                                                                                                          |
| `RDS_DATABASE`             | Database name (`postgres`)                                                                                                                        |
| `RDS_DB_USER`              | Database master username                                                                                                                          |
| `CONFIG_SECRET_ARN`        | Secrets Manager ARN for app config                                                                                                                |
| `ALLOWED_FRONTEND_ORIGINS` | Comma-separated allowed origins                                                                                                                   |
| `COGNITO_REDIRECT_URI`     | Set to `https://app.gitgazer.localhost:5173/api/auth/callback` so sign-in returns to the local backend (the config secret holds the deployed URL) |

### Optional HTTP Proxy Toggle

GitGazer supports an optional HTTP proxy Lambda for outbound calls to IPv4-only upstream services (for example GitHub and Slack).

- Terraform variable: `enable_http_proxy`
- Default: `true`

When enabled, backend calls using `proxyFetch` relay through the proxy Lambda.
When disabled, the backend falls back to direct `fetchWithRetry`.

Set it in `infra/terraform.tfvars`:

```hcl
enable_http_proxy = false
```

Then apply Terraform:

```bash
cd infra
aws-vault exec <profile> -- terraform apply
```

:::warning[Network requirement when disabled]
With `enable_http_proxy = false`, your backend environment must provide direct connectivity to target upstreams. In IPv6-only private subnet setups without IPv4 egress, calls to IPv4-only services can fail.
:::

### Optional Infrastructure Monitoring Toggle

Infrastructure alarming and Lambda log error filters can be toggled globally.

- Terraform variable: `enable_cloudwatch_alarm_notifications`
- Default: `true`

When disabled, Terraform creates no CloudWatch alarms, no Lambda log metric filters, and no SNS alarm topic.

Set it in `infra/terraform.tfvars`:

```hcl
enable_cloudwatch_alarm_notifications = false
```

Then apply Terraform:

```bash
cd infra
aws-vault exec <profile> -- terraform apply
```

See [Infrastructure Monitoring & Alerting](./infrastructure-monitoring.md) for full alarm coverage and notification behavior.

## Database Access

Connect to Aurora PostgreSQL via SSM Session Manager port forwarding through the bastion host. No SSH keys or open inbound ports required.

### Quick Start

The `db:tunnel` script automatically discovers the bastion instance and RDS Proxy endpoint, then opens a port-forwarding session:

```bash
aws-vault exec <profile> --no-session -- pnpm run db:tunnel
```

You should see output like:

```
ℹ  Looking up bastion instance gitgazer-bastion-prod in eu-central-1...
✔  Found bastion: i-0abc123def456
ℹ  Looking up RDS Proxy endpoint gitgazer-prod...
✔  Found RDS Proxy: gitgazer-prod.proxy-xxxx.eu-central-1.rds.amazonaws.com
ℹ  Starting SSM port-forwarding session...
  Local:  localhost:5432
  Remote: gitgazer-prod.proxy-xxxx.eu-central-1.rds.amazonaws.com:5432
✔  Connect with: psql -h localhost -p 5432 -U root
```

Keep this terminal open — the tunnel stays active until you press `Ctrl+C`.

#### Options

| Flag                | Default        | Description                                                   |
| ------------------- | -------------- | ------------------------------------------------------------- |
| `--local-port PORT` | `5432`         | Local port to bind (use a different port if 5432 is taken)    |
| `--workspace NAME`  | `prod`         | Terraform workspace to target (e.g. `default`, `staging`)     |
| `--direct`          | off            | Skip the RDS Proxy lookup and use the Aurora cluster endpoint |
| `--region REGION`   | `eu-central-1` | AWS region override                                           |

Example with a custom local port targeting the `default` workspace:

```bash
aws-vault exec <profile> --no-session -- pnpm run db:tunnel --workspace default --local-port 5433
```

#### Prerequisites

- **AWS CLI v2** installed and configured
- **[Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)** installed
- IAM permissions for `ssm:StartSession` and `ec2:DescribeInstances`
- The bastion host deployed (`enable_bastion = true` in Terraform; default `false`)

### Connect to the Database

With the tunnel running, the database is available at `localhost:5432` (or your chosen port). Open Drizzle Studio in a separate terminal:

```bash
cd packages/db
npx drizzle-kit studio
```

Or connect with any PostgreSQL client using `localhost:5432` and the credentials from your `.env` file.

### Manual Tunnel (Alternative)

If you prefer to run the command yourself, this is what `db:tunnel` executes (look up the bastion instance ID and the RDS Proxy or cluster endpoint first):

```bash
aws ssm start-session \
    --target <BASTION_INSTANCE_ID> \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"host":["<DB_ENDPOINT>"],"portNumber":["5432"],"localPortNumber":["5432"]}'
```

## Running Tests

```bash
# Every backend project, from the repository root
pnpm nx run-many -t test:unit

# Or a single backend project
cd apps/lambdas/api   # or worker, backfill-worker, websocket, org-sync-scheduler, http-proxy
pnpm run test:unit

# Frontend
cd apps/web
pnpm run test:run
```

The backend suite is split across the Lambda apps under `apps/lambdas/` and the shared packages
(`packages/backend-core`, `packages/backend-services`, `packages/github-import`, `packages/db`), so running one
project only covers that project.

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
2. Verify Cognito has `https://app.gitgazer.localhost:5173/api/auth/callback` as an allowed callback URL
3. For the local backend, check that `COGNITO_REDIRECT_URI` points to `https://app.gitgazer.localhost:5173/api/auth/callback`
4. Clear all cookies and try again

### Backend Won't Start

1. Verify AWS credentials: `aws-vault exec <profile> -- aws sts get-caller-identity`
2. Check `apps/lambdas/api/.env` has the correct `AWS_REGION`
3. Ensure your IAM role has permissions for RDS, Secrets Manager, SQS, and KMS

### Port Already in Use

```bash
# Find and kill the process on the port
lsof -i :5173  # frontend
lsof -i :8080  # backend
kill -9 <PID>
```
