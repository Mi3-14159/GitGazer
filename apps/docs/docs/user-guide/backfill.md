---
sidebar_position: 5
title: Backfilling Historical Data
description: Import historical GitHub Actions runs, jobs, and pull requests into GitGazer by invoking the serverless backfill worker.
---

# Backfilling Historical Data

GitGazer starts collecting data from the moment you set up a webhook. To fill in data from **before** the webhook was active, run a **backfill** — a serverless import of historical workflow runs, jobs, and pull requests straight from the GitHub API.

Backfill runs entirely inside AWS: you trigger it once with a single command and the work continues on its own, retrying transient failures and resuming automatically. There is no long-running script to babysit. For the architecture behind it, see the [Backfill Pipeline](../technical/backfill-pipeline.md) technical doc.

## Prerequisites

- The GitGazer infrastructure deployed, including the `backfill-worker` Lambda.
- **AWS CLI access** to the account, with permission to invoke the Lambda, write the PAT secret, and read SQS/CloudWatch (e.g. via `aws-vault` or an assumed role).
- An existing GitGazer integration and its **integration ID** (a UUID) — see [Setting Up Integrations](integrations.md).
- A [GitHub personal access token](https://github.com/settings/tokens) with `repo` and `read:org` scopes for the organization or user you want to import.

:::info[Naming conventions]
The examples below assume the default Terraform workspace, so resources are named with the `-default` suffix and secrets with the `/default/` segment. Replace `default` with your environment name if you deploy to a different workspace.
:::

## Step 1 — Store the GitHub token

Each integration authenticates with its own PAT, stored as a **raw string** (not JSON) in AWS Secrets Manager at `gitgazer/backfill/<environment>/<integrationId>`.

Create the secret once per integration:

```bash
aws secretsmanager create-secret \
  --name "gitgazer/backfill/default/<integrationId>" \
  --secret-string "ghp_yourTokenHere"
```

To rotate an existing token, use `put-secret-value` instead:

```bash
aws secretsmanager put-secret-value \
  --secret-id "gitgazer/backfill/default/<integrationId>" \
  --secret-string "ghp_newTokenHere"
```

## Step 2 — Trigger the backfill

Invoke the worker directly with a JSON payload describing the run. The payload becomes the initial `discover` task, which fans out into per-repository, per-page, and per-entity work.

```bash
aws lambda invoke \
  --function-name gitgazer-backfill-worker-default \
  --cli-binary-format raw-in-base64-out \
  --payload '{
    "integrationId": "<integrationId>",
    "owner": "<github-org-or-user>",
    "eventTypes": ["workflow_run","workflow_job","pull_request","pull_request_review"],
    "since": "2025-01-01",
    "until": "2025-12-31"
  }' \
  /dev/stdout
```

The command returns as soon as the run is seeded — the actual import proceeds asynchronously through SQS.

### Payload reference

| Field           | Required | Description                                                                                    |
| --------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `integrationId` | Yes      | UUID of the integration to import into. Must match the PAT secret suffix from Step 1.          |
| `owner`         | Yes      | GitHub organization or user. Discovery lists its repos (org endpoint first, user as fallback). |
| `eventTypes`    | Yes      | Non-empty subset of the four [supported event types](#supported-event-types).                  |
| `repo`          | No       | Restrict the run to a single repository (skips org-wide discovery).                            |
| `topics`        | No       | Array of topics — import only repos carrying at least one (e.g. `["production"]`).             |
| `since`         | No       | Inclusive start date, `YYYY-MM-DD`. Omit for all-time.                                         |
| `until`         | No       | Inclusive end date, `YYYY-MM-DD`. Omit for all-time.                                           |

Archived and disabled repositories are always skipped during discovery.

:::note[How `since` / `until` are applied]
The date window is interpreted differently per event type:

- **Workflow runs** are filtered by their **created** date, server-side by the GitHub API — only runs in range are fetched.
- **Pull requests** (and their reviews) are filtered by their **last-updated** date, client-side. Because the API returns PRs newest-first, providing `since` lets the worker **stop early** once it pages past the boundary. An `until`-only window still scans from the newest PR down to the in-range ones, so pair `until` with `since` for the most efficient PR backfills.

GitHub also only exposes the **first 1,000 workflow runs** for any single query. If a repository has more runs than that in your window, the worker imports the most recent 1,000 and logs a warning — narrow `since` / `until` to capture the rest.
:::

## Step 3 — Monitor the run

Follow the worker logs to watch discovery and ingestion:

```bash
aws logs tail /aws/lambda/gitgazer-backfill-worker-default --follow
```

A run is **finished** when the task queue is fully drained — both message counts reach zero:

```bash
aws sqs get-queue-attributes \
  --queue-url <backfill-tasks-queue-url> \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```

Tasks that exhaust their retries land in the dead-letter queue `gitgazer-backfill-tasks-dlq-default`. If you've enabled alarm notifications, a CloudWatch alarm fires whenever the DLQ is non-empty. See [Troubleshooting](#troubleshooting) below.

## Examples

### A single repository's last 3 months

```json
{
    "integrationId": "b10d8a34-b65f-4688-9d0e-54c30638b767",
    "owner": "my-org",
    "repo": "my-service",
    "eventTypes": ["workflow_run", "workflow_job"],
    "since": "2026-03-01"
}
```

### All repos with a topic filter

```json
{
    "integrationId": "b10d8a34-b65f-4688-9d0e-54c30638b767",
    "owner": "my-org",
    "topics": ["production"],
    "eventTypes": ["workflow_run", "workflow_job", "pull_request", "pull_request_review"]
}
```

### Only pull requests and reviews

```json
{
    "integrationId": "b10d8a34-b65f-4688-9d0e-54c30638b767",
    "owner": "my-org",
    "repo": "my-service",
    "eventTypes": ["pull_request", "pull_request_review"],
    "since": "2025-06-01"
}
```

## Supported Event Types

| Event Type            | What It Imports                                             |
| --------------------- | ----------------------------------------------------------- |
| `workflow_run`        | Workflow run starts, completions, and status changes        |
| `workflow_job`        | Individual job starts, completions, and failures            |
| `pull_request`        | Pull request opens, closes, merges, and updates             |
| `pull_request_review` | Review submissions (approved, changes requested, commented) |

## How It Works

When you invoke the worker, it:

1. Treats your payload as a `discover` task and lists the repositories to import.
2. Fans the work out into small SQS tasks — one per page of results, then one per workflow run or pull request.
3. Fetches each entity from the GitHub REST API (through GitGazer's HTTP proxy) using your stored PAT.
4. Transforms each record into the same shape a live webhook produces and ingests it via `insertEvent()`.

Because backfilled data flows through the **same ingestion path** as live webhooks, no special handling is required — and the upserts are idempotent. See the [Backfill Pipeline](../technical/backfill-pipeline.md) for the full design.

## Rate Limits

The worker handles GitHub rate limits automatically: short waits are retried inline, while longer waits release the task back to SQS so no compute is wasted idling. Concurrency is capped (default 5 parallel workers) to stay clear of GitHub's secondary limits.

The worker also skips redundant calls on its own: once a repository (and its organization) has been imported — by an earlier backfill or by a live webhook — the worker reuses those stored details instead of re-fetching them from GitHub. Re-runs and incremental backfills of repositories GitGazer already tracks therefore make fewer API calls.

For very large imports, you can still reduce total API calls by:

- Narrowing the window with `since` and `until`.
- Importing only the event types you need.

:::tip
GitHub's REST API returns workflow runs in pages of 100. The worker paginates automatically, but tighter date windows mean fewer pages and a faster run.
:::

:::warning
Backfill ingestion is idempotent — re-running it for the same range is safe. The upsert freshness guards update or skip existing records rather than creating duplicates, so a retried or overlapping run won't corrupt your data.
:::

## Troubleshooting

| Symptom                             | Likely cause & fix                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Invoke succeeds but no data appears | Wrong `integrationId`, or the PAT secret name doesn't match it. Confirm the secret from Step 1.                 |
| Tasks land in the DLQ immediately   | Missing or empty PAT secret, or a token without `repo` / `read:org` scope. Check the worker logs for the error. |
| Discovery finds no repositories     | The `owner` is misspelled, or the PAT can't see the org's repos. Verify the token's access.                     |
| Run seems stuck                     | Check queue depth (Step 3). A large org legitimately produces many tasks; watch the counts trend toward zero.   |

To retry failed tasks after fixing the cause, redrive the DLQ back to the main queue from the SQS console, or simply re-run the backfill — idempotency makes re-imports safe.
