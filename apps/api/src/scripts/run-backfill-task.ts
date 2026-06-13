/**
 * Local backfill task runner — replay a single backfill task without deploying.
 *
 * Primary use case: a message has landed in the backfill DLQ and you need to
 * find out *why* it failed. This script pulls one message (or takes an inline /
 * file body), runs it through the exact same `routeTask` path the deployed
 * worker uses, and lets the error throw with a full stack trace instead of
 * being swallowed into a single structured log line.
 *
 * It uses the same environment as `dev:api` and the drizzle scripts:
 *   - AWS credentials (e.g. `aws-vault exec <profile> --no-session -- ...`)
 *   - `.env` with RDS_* (database) and CONFIG_SECRET_ARN (loads the proxy fn etc.)
 *   - a reachable database (run `scripts/db-tunnel.sh` when using rds-proxy mode)
 *   - BACKFILL_SECRET_PREFIX so the per-integration PAT secret resolves; the
 *     deployed default is `<name_prefix>/backfill/<workspace>`, e.g.
 *     `gitgazer/backfill/default`
 *
 * The queue is treated as READ-ONLY: received messages are NOT deleted (they
 * reappear after the visibility timeout) and follow-up tasks are NOT enqueued
 * unless you pass `--enqueue`.
 *
 * Usage:
 *   # Pull one message from the DLQ and run it
 *   pnpm run dev:backfill -- --queue-url <dlq-url>
 *
 *   # Replay a specific task body inline
 *   pnpm run dev:backfill -- --body '{"kind":"pull_request","integrationId":"<uuid>","owner":"my-org","repo":"my-svc","pullNumber":42,"eventTypes":["pull_request","pull_request_review"]}'
 *
 *   # Replay a task body from a file
 *   pnpm run dev:backfill -- --file ./tmp/failed-task.json
 */
import {sendBackfillTasks} from '@/domains/backfill/queue';
import {routeTask} from '@/domains/backfill/router';
import {parseTask} from '@/domains/backfill/tasks';
import '@/shared/bootstrap';
import {loadConfig} from '@/shared/config';
import {ReceiveMessageCommand, SQSClient} from '@aws-sdk/client-sqs';
import {initDb} from '@gitgazer/db/client';
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';

const HELP = `
Replay a single GitGazer backfill task locally (DLQ debugging).

Options:
  --queue-url <url>   SQS queue URL to receive one message from (typically the
                      backfill DLQ). Falls back to the BACKFILL_DLQ_URL env var.
  --body <json>       Inline JSON task body to replay instead of receiving one.
  --file <path>       Path to a file containing a JSON task body.
  --enqueue           Push any follow-up tasks onto the backfill queue
                      (default: off — follow-ups are only printed).
  --help              Show this help.

The queue is read-only: received messages are left on the queue (they reappear
after the visibility timeout). Run under AWS credentials with the same .env used
by dev:api, and set BACKFILL_SECRET_PREFIX (e.g. gitgazer/backfill/default).
`;

interface CliOptions {
    queueUrl?: string;
    file?: string;
    body?: string;
    enqueue: boolean;
}

interface AcquiredMessage {
    body: string;
    source: string;
}

const parseCliArgs = (): CliOptions => {
    // pnpm forwards the `--` separator through to the script (so
    // `pnpm run dev:backfill -- --body ...` arrives as `-- --body ...`). Node's
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
            enqueue: {type: 'boolean', default: false},
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
        enqueue: values.enqueue ?? false,
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

    const queueUrl = opts.queueUrl ?? process.env.BACKFILL_DLQ_URL;
    if (!queueUrl) {
        throw new Error('No task source: pass --queue-url <dlq-url> (or set BACKFILL_DLQ_URL), or supply --body / --file.');
    }

    return receiveOneFromQueue(queueUrl);
};

const main = async (): Promise<void> => {
    const opts = parseCliArgs();

    await initDb();
    await loadConfig();

    if (!process.env.BACKFILL_SECRET_PREFIX) {
        console.warn(
            '[warn] BACKFILL_SECRET_PREFIX is not set; PAT resolution will use the default "gitgazer/backfill" prefix. ' +
                'If the secret is not found, set it to the deployed value (e.g. "gitgazer/backfill/default").',
        );
    }

    const {body, source} = await acquireMessage(opts);
    console.info(`\nLoaded task from ${source}:\n${body}\n`);

    const task = parseTask(JSON.parse(body));
    const repo = 'repo' in task ? task.repo : '-';
    console.info(`Routing "${task.kind}" task (integrationId=${task.integrationId}, repo=${repo})...\n`);

    const followUps = await routeTask(task);

    console.info(`\nTask completed successfully. ${followUps.length} follow-up task(s) produced.`);
    if (followUps.length > 0) {
        console.info(JSON.stringify(followUps, null, 2));

        if (opts.enqueue) {
            await sendBackfillTasks(followUps);
            console.info(`Enqueued ${followUps.length} follow-up task(s) onto the backfill queue.`);
        } else {
            console.info('(Pass --enqueue to push these follow-up tasks onto the queue.)');
        }
    }
};

main()
    .then(() => process.exit((process.exitCode as number) ?? 0))
    .catch((error: unknown) => {
        console.error('\nTask processing FAILED:\n');
        console.error(error instanceof Error ? (error.stack ?? error.message) : error);
        process.exit(1);
    });
