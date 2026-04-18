---
sidebar_position: 4
title: Backfilling Historical Data
description: Import historical GitHub Actions runs, jobs, and pull requests into GitGazer.
---

# Backfilling Historical Data

GitGazer starts collecting data from the moment you set up a webhook. To fill in data from **before** the webhook was active, use the backfill tool to import historical workflow runs, jobs, and pull requests from the GitHub API.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+ installed
- A [GitHub personal access token](https://github.com/settings/tokens) with `repo` and `read:org` scopes
- An existing GitGazer integration — see [Setting Up Integrations](integrations.md)
- Your integration's **webhook secret** (visible on the Integrations page)

## Quick Start

1. Clone the GitGazer repository and install dependencies:

    ```bash
    git clone https://github.com/Mi3-14159/GitGazer.git
    cd GitGazer
    pnpm install
    ```

2. Create a `.env` file in `packages/import/`:

    ```bash
    cd packages/import
    cp .env.example .env
    ```

3. Fill in the required values (see [Configuration](#configuration) below).

4. Run the backfill:

    ```bash
    pnpm run backfill
    ```

## Configuration

All settings are configured via environment variables in `packages/import/.env`.

### Required Variables

| Variable             | Description                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| `API_URL`            | Your GitGazer API URL (e.g. `https://app.gitgazer.com`)                   |
| `INTEGRATION_ID`     | UUID of the integration to import into — find it on the Integrations page |
| `INTEGRATION_SECRET` | The integration's webhook secret — copy it from the Integrations page     |
| `GITHUB_TOKEN`       | GitHub personal access token with `repo` and `read:org` scopes            |
| `GITHUB_OWNER`       | GitHub organization or user account name                                  |

### Repository Selection

Choose **one** of these modes:

| Variable       | Description                                                                        |
| -------------- | ---------------------------------------------------------------------------------- |
| `GITHUB_REPO`  | Import a single repository (e.g. `my-repo`)                                        |
| `GITHUB_TOPIC` | Discover org repos filtered by topic(s), comma-separated (e.g. `frontend,backend`) |
| _(neither)_    | Import all active (non-archived, non-disabled) repositories in the org             |

### Optional Variables

| Variable      | Default                                                      | Description                                                      |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `SINCE`       | _(all time)_                                                 | Start date for the import window, ISO format (e.g. `2025-01-01`) |
| `UNTIL`       | _(all time)_                                                 | End date for the import window, ISO format (e.g. `2025-12-31`)   |
| `EVENT_TYPES` | `workflow_run,workflow_job,pull_request,pull_request_review` | Comma-separated list of event types to import                    |
| `CONCURRENCY` | `1`                                                          | Number of workflow runs to process in parallel                   |
| `DRY_RUN`     | `false`                                                      | Set to `true` to preview without sending data to the API         |

## Examples

### Import a single repository's last 3 months

```env
API_URL=https://app.gitgazer.com
INTEGRATION_ID=b10d8a34-b65f-4688-9d0e-54c30638b767
INTEGRATION_SECRET=your-secret-here
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_OWNER=my-org
GITHUB_REPO=my-service
SINCE=2026-01-01
CONCURRENCY=10
```

### Import all repos with a topic filter

```env
API_URL=https://app.gitgazer.com
INTEGRATION_ID=b10d8a34-b65f-4688-9d0e-54c30638b767
INTEGRATION_SECRET=your-secret-here
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_OWNER=my-org
GITHUB_TOPIC=production
CONCURRENCY=5
```

### Import only pull requests and reviews

```env
API_URL=https://app.gitgazer.com
INTEGRATION_ID=b10d8a34-b65f-4688-9d0e-54c30638b767
INTEGRATION_SECRET=your-secret-here
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_OWNER=my-org
GITHUB_REPO=my-service
EVENT_TYPES=pull_request,pull_request_review
SINCE=2025-06-01
```

### Dry run to preview

Add `DRY_RUN=true` to any configuration to see what would be imported without sending data:

```bash
DRY_RUN=true pnpm run backfill
```

## Supported Event Types

| Event Type            | What It Imports                                             |
| --------------------- | ----------------------------------------------------------- |
| `workflow_run`        | Workflow run starts, completions, and status changes        |
| `workflow_job`        | Individual job starts, completions, and failures            |
| `pull_request`        | Pull request opens, closes, merges, and updates             |
| `pull_request_review` | Review submissions (approved, changes requested, commented) |

## How It Works

The backfill tool:

1. Fetches historical data from the GitHub REST API using your personal access token.
2. Transforms each record into the same webhook event format that GitHub sends in real-time.
3. Sends each event to your GitGazer API's import endpoint (`POST /api/import/:integrationId`), signed with your integration secret.

This means backfilled data goes through the exact same processing pipeline as live webhook events — no special handling required.

## Rate Limits

The tool respects GitHub API rate limits automatically. When the remaining quota drops to 5 requests, it pauses until the rate limit window resets. For large imports, consider:

- Narrowing the date range with `SINCE` and `UNTIL`
- Importing specific event types instead of all four
- Starting with `DRY_RUN=true` to estimate volume

:::tip
GitHub's REST API returns a maximum of 100 workflow runs per query. For repositories with more runs, use narrower date windows (e.g. month-by-month) to capture the full history.
:::

:::warning
The backfill tool uses upsert logic — re-running it for the same date range is safe and will update existing records rather than creating duplicates.
:::
