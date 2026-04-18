---
sidebar_position: 3
title: Webhook Processing Pipeline
description: How GitHub webhook events are received, verified, queued, and processed asynchronously.
---

# Webhook Processing Pipeline

GitGazer receives GitHub webhook events, verifies their authenticity, and processes them asynchronously through an SQS queue. This decouples the webhook response from event processing — GitHub gets a fast 200 response while the heavy lifting happens in a worker Lambda.

## Two Ingress Paths

GitGazer supports two ways to receive webhook events from GitHub:

```mermaid
graph LR
    subgraph GitHub
        REPO["Repository / Org Webhook"]
        APP["GitHub App"]
    end

    subgraph "REST Lambda"
        IW["POST /api/import/:integrationId"]
        AW["POST /api/github/webhook"]
    end

    SQS["SQS FIFO Queue"]

    REPO -- "Per-integration secret" --> IW
    APP -- "App-level secret" --> AW
    IW -- "Enqueue" --> SQS
    AW -- "Direct handling" --> SQS
```

### 1. Integration Webhooks

**Endpoint**: `POST /api/import/:integrationId`

This is the primary path for receiving workflow events. Each integration has its own webhook URL and HMAC secret.

**Request flow**:

1. GitHub sends a webhook with `X-Hub-Signature-256` and `X-GitHub-Event` headers.
2. The `verifyGithubSign` middleware:
    - Looks up the integration's secret from the database (scoped by `integrationId` via RLS).
    - Computes `HMAC-SHA256` of the request body with the integration secret.
    - Compares it to the `X-Hub-Signature-256` header using `crypto.timingSafeEqual` (prevents timing attacks).
3. The route handler validates the `X-GitHub-Event` header against supported event types.
4. The event is enqueued to SQS for async processing.
5. GitHub receives `{"message": "ok"}` immediately.

:::info[Ping events]
GitHub sends a `ping` event when a webhook is first created. This is handled inline (returns `{"message": "ok"}`) without enqueuing to SQS.
:::

### 2. GitHub App Webhooks

**Endpoint**: `POST /api/github/webhook`

This path handles events from the GitGazer GitHub App installation lifecycle (e.g., app installed, app uninstalled, org member changes).

**Request flow**:

1. GitHub sends a webhook signed with the app-level secret.
2. The `verifyGithubAppSignature` middleware validates the signature using the global GitHub App webhook secret (from Secrets Manager).
3. The handler validates the event type against supported GitHub App events.
4. Events are dispatched to the app event handler for processing.

## SQS Queue Architecture

```mermaid
graph LR
    REST["REST Lambda"] -- "SendMessage" --> MAIN["Main Queue<br/>(FIFO)"]
    MAIN -- "Batch of up to 10" --> WORKER["Worker Lambda"]
    MAIN -- "maxReceiveCount: 1" --> DLQ["Dead-Letter Queue<br/>(FIFO, 14-day retention)"]
    DLQ -- "Alarm" --> CW["CloudWatch Alarm"]
```

### Main Queue

| Property            | Value                                  |
| ------------------- | -------------------------------------- |
| Type                | FIFO                                   |
| Deduplication scope | Per message group ID                   |
| Throughput limit    | Per message group ID (high throughput) |
| Visibility timeout  | 1.5× Worker Lambda timeout             |
| Message retention   | 1 day                                  |
| Max message size    | 1 MB                                   |
| Polling             | Long polling (5 second wait)           |
| Encryption          | KMS                                    |

The queue uses **message group IDs** to maintain ordering within an integration while allowing parallel processing across integrations.

### Dead-Letter Queue

Messages that fail processing are moved to the DLQ after **1 retry** (`maxReceiveCount: 1`). The DLQ retains messages for **14 days** to allow investigation. A CloudWatch alarm fires when any message lands in the DLQ.

## Worker Lambda

The Worker Lambda is triggered by an SQS event source mapping with a batch size of 10. It uses **partial batch failure reporting** — if some records in a batch fail, only those records are retried (not the entire batch).

### Processing Pipeline

```mermaid
flowchart TD
    A["Receive SQS batch (up to 10 records)"] --> B{For each record}
    B --> C["Parse message body"]
    C --> D{taskType?}
    D -- "org_member_sync" --> E["Sync org members"]
    D -- "webhook event" --> F["Insert/upsert event into database"]
    F --> G{Event type?}
    G -- "workflow_run / workflow_job" --> H["Push to WebSocket clients"]
    G -- "workflow_job (failed)" --> I["Send alerts via notification rules"]
    G -- "Other" --> J["Done"]
    H --> I
    I --> J
    E --> J
    J --> K{Success?}
    K -- "Yes" --> L["Record processed"]
    K -- "No (core failure)" --> M["Add to batchItemFailures"]
```

### Step-by-step

1. **Parse** — The SQS record body is parsed as JSON. Messages are either webhook events or org member sync tasks.

2. **Route by task type** — If the message has `taskType: 'org_member_sync'`, it delegates to the org member sync handler. Otherwise, it processes as a webhook event.

3. **Insert event** — The webhook event is inserted or upserted into the database. The importer handles deduplication — stale events (older than what's already in the database) are detected and skipped.

4. **Post-commit side effects** — After the database write succeeds:
    - **WebSocket push**: For `workflow_run` and `workflow_job` events that aren't stale, the worker pushes the updated data to all connected WebSocket clients for that integration.
    - **Alerting**: For `workflow_job` events, the worker checks notification rules and sends alerts for completed failures.

5. **Report failures** — The handler returns `batchItemFailures` containing the message IDs of any records that failed core processing. SQS retries only those records.

### Error Handling

The pipeline separates **core processing** from **side effects**:

- **Core processing failures** (parse errors, database write failures) cause the record's message ID to be added to `batchItemFailures`. SQS retries the message, and after `maxReceiveCount` failures, it moves to the DLQ.

- **Side-effect failures** (WebSocket push errors, alerting errors) are caught, logged with a warning, and **not retried**. The event data is already persisted — the side effect can be manually remediated if needed.

This design ensures that a transient WebSocket connection error or notification delivery failure never causes duplicate event processing.

## Supported Event Types

### Integration Webhooks

| GitHub Event          | What GitGazer Does                                                             |
| --------------------- | ------------------------------------------------------------------------------ |
| `workflow_run`        | Upserts workflow run data (status, conclusion, timing, metadata)               |
| `workflow_job`        | Upserts job data (steps, timing, runner info). Triggers alerting for failures. |
| `pull_request`        | Upserts pull request data (title, state, author, labels)                       |
| `pull_request_review` | Upserts review data (state, author, body)                                      |
| `ping`                | Returns OK (webhook health check, not enqueued)                                |

### GitHub App Webhooks

| GitHub Event   | What GitGazer Does                                             |
| -------------- | -------------------------------------------------------------- |
| `installation` | Tracks GitHub App installation/uninstallation on orgs/accounts |
| `organization` | Handles member added/removed events for org member sync        |

## Monitoring

- **CloudWatch Logs** — The Worker Lambda logs to a dedicated CloudWatch log group with 30-day retention. Logs are structured JSON via AWS Powertools Logger.
- **DLQ Alarm** — A CloudWatch alarm fires when any message lands in the dead-letter queue, indicating a processing failure that needs investigation.
- **Partial batch failures** — SQS automatically tracks retry counts per message. The `ReportBatchItemFailures` response type ensures only failed messages are retried.
