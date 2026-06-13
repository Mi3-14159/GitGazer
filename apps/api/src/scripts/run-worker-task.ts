/**
 * Local webhook worker runner — replay a single webhook-events message without
 * deploying.
 *
 * Primary use case: a message has landed in the webhook-events DLQ (the queue
 * uses maxReceiveCount=1, so any worker failure dead-letters immediately) and
 * you need to find out *why* it failed. This script pulls one message (or takes
 * an inline / file body), runs it through the exact same `processRecord` path
 * the deployed worker uses, and lets the error throw with a full stack trace
 * instead of being swallowed into a single `batchItemFailures` log line.
 *
 * It uses the same environment as `dev:api` and `dev:backfill`:
 *   - AWS credentials (e.g. `aws-vault exec <profile> --no-session -- ...`)
 *   - `.env` with RDS_* (database) and CONFIG_SECRET_ARN (loads the proxy fn etc.)
 *   - a reachable database (run `scripts/db-tunnel.sh` when using rds-proxy mode)
 *
 * The queue is treated as READ-ONLY: received messages are NOT deleted (they
 * reappear after the visibility timeout) so a message can be inspected again or
 * redriven later.
 *
 * Post-commit side effects (WebSocket broadcast + Slack/webhook alerts) are
 * SKIPPED by default so replaying a failed `workflow_job` does not spam real
 * alert channels — the database insert path, where DLQ'd messages actually
 * fail, runs identically. Pass `--side-effects` to run them for real.
 *
 * Usage:
 *   # Pull one message from the webhook DLQ and run it
 *   pnpm run dev:worker -- --queue-url <dlq-url>
 *
 *   # Replay a specific webhook message inline
 *   pnpm run dev:worker -- --body '{"integrationId":"<uuid>","eventType":"workflow_job","payload":{ ... }}'
 *
 *   # Replay a message body from a file (e.g. one dumped from CloudWatch)
 *   pnpm run dev:worker -- --file ./tmp/failed-message.json
 */
import {processRecord} from '@/domains/webhooks/worker/batch-processor';
import '@/shared/bootstrap';
import {loadConfig} from '@/shared/config';
import {ReceiveMessageCommand, SQSClient} from '@aws-sdk/client-sqs';
import {initDb} from '@gitgazer/db/client';
import type {SQSRecord} from 'aws-lambda';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';

const HELP = `
Replay a single GitGazer webhook-events message locally (DLQ debugging).

Options:
  --queue-url <url>   SQS queue URL to receive one message from (typically the
                      webhook-events DLQ). Falls back to the WEBHOOK_DLQ_URL env var.
  --body <json>       Inline JSON message body to replay instead of receiving one.
  --file <path>       Path to a file containing a JSON message body.
  --side-effects      Run post-commit side effects (WebSocket broadcast +
                      Slack/webhook alerts) for real (default: off — the DB
                      insert path still runs, but no alerts are sent).
  --help              Show this help.

The queue is read-only: received messages are left on the queue (they reappear
after the visibility timeout). Run under AWS credentials with the same .env used
by dev:api (RDS_* + CONFIG_SECRET_ARN).
`;

interface CliOptions {
    queueUrl?: string;
    file?: string;
    body?: string;
    sideEffects: boolean;
}

interface AcquiredMessage {
    body: string;
    source: string;
}

const parseCliArgs = (): CliOptions => {
    // pnpm forwards the `--` separator through to the script (so
    // `pnpm run dev:worker -- --body ...` arrives as `-- --body ...`). Node's
    // parseArgs treats everything after a bare `--` as positionals, which this
    // command does not accept, so strip a leading separator before parsing.
    const rawArgs = process.argv.slice(2);
    const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

    const {values} = parseArgs({
        args,
        options: {
            'queue-url': {type: 'string'},
            file: {type: 'string'},
            body: {type: 'string'},
            'side-effects': {type: 'boolean', default: false},
            help: {type: 'boolean', default: false},
        },
    });

    if (values.help) {
        console.info(HELP);
        process.exit(0);
    }

    return {
        queueUrl: values['queue-url'],
        file: values.file,
        body: values.body,
        sideEffects: values['side-effects'] ?? false,
    };
};

/**
 * Receives a single message from a queue without deleting it. A short visibility
 * timeout keeps the debugging run non-destructive — the message returns to the
 * queue shortly after, so it can be inspected again or redriven later.
 */
const receiveOneFromQueue = async (queueUrl: string): Promise<AcquiredMessage> => {
    const sqs = new SQSClient({region: process.env.AWS_REGION});
    const result = await sqs.send(
        new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 1,
            VisibilityTimeout: 30,
            WaitTimeSeconds: 5,
        }),
    );

    const message = result.Messages?.[0];
    if (!message?.Body) {
        throw new Error(`No messages available on ${queueUrl} (queue empty or all messages in-flight).`);
    }

    return {body: message.Body, source: `queue ${queueUrl}`};
};

const acquireMessage = async (opts: CliOptions): Promise<AcquiredMessage> => {
    if (opts.file) {
        return {body: readFileSync(opts.file, 'utf-8'), source: `file ${opts.file}`};
    }
    if (opts.body) {
        return {body: opts.body, source: 'inline --body'};
    }

    const queueUrl = opts.queueUrl ?? process.env.WEBHOOK_DLQ_URL;
    if (!queueUrl) {
        throw new Error('No message source: pass --queue-url <dlq-url> (or set WEBHOOK_DLQ_URL), or supply --body / --file.');
    }

    return receiveOneFromQueue(queueUrl);
};

/**
 * Wraps a raw message body in a minimal SQSRecord so it can be passed to the
 * real `processRecord` handler. Only `body` is read by the worker; the rest are
 * plausible placeholders mirroring the deployed event shape.
 */
const toSqsRecord = (body: string): SQSRecord => {
    const now = String(Date.now());
    return {
        messageId: randomUUID(),
        receiptHandle: 'local-debug-receipt-handle',
        body,
        attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: now,
            SenderId: 'local-debug',
            ApproximateFirstReceiveTimestamp: now,
        },
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:local:0:gitgazer-webhook-events.fifo',
        awsRegion: process.env.AWS_REGION ?? 'local',
    };
};

const main = async (): Promise<void> => {
    const opts = parseCliArgs();

    await initDb();
    await loadConfig();

    const {body, source} = await acquireMessage(opts);
    console.info(`\nLoaded message from ${source}:\n${body}\n`);

    const message = JSON.parse(body) as Record<string, unknown>;
    const isOrgSync = message.taskType === 'org_member_sync';
    const isWebhook = !isOrgSync && 'eventType' in message;

    if (isOrgSync) {
        console.info(
            `Replaying org_member_sync task (installationId=${String(message.installationId)}, accountLogin=${String(message.accountLogin)})...\n`,
        );
    } else if (isWebhook) {
        console.info(`Replaying webhook "${String(message.eventType)}" event (integrationId=${String(message.integrationId)})...\n`);
    } else {
        console.info('Replaying message (unrecognized shape — passing through to the worker as-is)...\n');
    }

    let effectiveBody = body;
    if (isWebhook && !opts.sideEffects) {
        // `processRecord` gates its post-commit side effects (WebSocket broadcast
        // + Slack/webhook alerts) on `source === 'backfill'`. Reuse that gate so a
        // replayed failure does not fire real alerts. The DB insert path
        // (`insertEvent`) — where DLQ'd messages actually fail — runs identically.
        effectiveBody = JSON.stringify({...message, source: 'backfill'});
        console.info('Post-commit side effects (WebSocket + alerts) DISABLED. Pass --side-effects to run them.\n');
    } else if (isWebhook && opts.sideEffects) {
        console.info('Post-commit side effects (WebSocket + alerts) ENABLED — real alerts may be sent.\n');
    }

    await processRecord(toSqsRecord(effectiveBody));

    console.info('\nMessage processed successfully.');
};

main()
    .then(() => process.exit((process.exitCode as number) ?? 0))
    .catch((error: unknown) => {
        console.error('\nMessage processing FAILED:\n');
        console.error(error instanceof Error ? (error.stack ?? error.message) : error);
        process.exit(1);
    });
