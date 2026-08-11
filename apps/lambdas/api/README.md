# apps/lambdas/api — GitGazer REST API

AWS Lambda serving the GitGazer REST API and the GitHub webhook intake endpoint.

The other Lambdas live next to this one under `apps/lambdas/`: `websocket`, `worker`,
`backfill-worker`, `org-sync-scheduler` and `http-proxy`. Shared backend code lives in
`packages/backend-core`, `packages/backend-services` and `packages/github-import`.

## Quick Start

```bash
pnpm install

# Configure environment: create a .env at the repo root (shared by every app's dev script)

# Run local development server (port 8080)
aws-vault exec <profile> --no-session -- pnpm run dev:api

# Run tests
pnpm run test:unit
```

**Note:** When running the frontend locally (`cd ../../web && pnpm run dev`), it can proxy API requests to this local backend server via Vite's built-in proxy. Configure the frontend's `.env.local` with `VITE_REST_API_ENDPOINT="https://app.gitgazer.localhost:5173/api"` to enable this. See [local-development.md](../../docs/docs/technical/local-development.md) for details.

## Build Commands

```bash
pnpm run build                       # Bundles src/index.ts into dist/gitgazer-api.zip
nx run @gitgazer/lambda-api:upload   # Syncs dist/ to $S3_BUCKET_LAMBDA_STORE

pnpm run dev:api                     # Local server on port 8080 with hot reload
pnpm run test:unit                   # Run all unit tests
pnpm run lint                        # Check for linting errors
pnpm run lint:fix                    # Auto-fix linting errors
pnpm run pretty                      # Format code with Prettier
```

Uploading a zip does not deploy it: the Lambda pins a specific `s3_object_version`, so the new
code only goes live once Terraform applies (the `CI/CD Infra` workflow).

For detailed development instructions, see [backend.instructions.md](../../../.github/instructions/backend.instructions.md).
