import {GitHubApiError} from '@/domains/backfill/github';
import {sendBackfillTasks} from '@/domains/backfill/queue';
import {routeTask} from '@/domains/backfill/router';
import {parseInitialTask, parseTask} from '@/domains/backfill/tasks';
import '@/shared/bootstrap';
import {changeMessageVisibility} from '@/shared/clients/sqs.client';
import config, {loadConfig} from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {initDb} from '@gitgazer/db/client';
import type {SQSBatchResponse, SQSEvent, SQSRecord} from 'aws-lambda';

const logger = getLogger();
let initPromise: Promise<void> | null = null;

/** SQS hard cap on a message's visibility timeout (12 hours). */
const MAX_SQS_VISIBILITY_SECONDS = 12 * 60 * 60;

const init = async (): Promise<void> => {
    await initDb();
    await loadConfig();
};

const isSqsEvent = (event: unknown): event is SQSEvent =>
    typeof event === 'object' && event !== null && Array.isArray((event as Partial<SQSEvent>).Records);

/**
 * Defers a rate-limited task until GitHub's limit resets by extending the SQS
 * message's visibility timeout. Best-effort: failures are logged and swallowed
 * so the message still falls back to the queue's default timeout and is counted
 * as a batch-item failure by the caller.
 */
const deferUntilRateLimitReset = async (record: SQSRecord, retryAfterMs: number): Promise<void> => {
    const queueUrl = config.get('backfillQueueUrl');
    if (!queueUrl) return;

    const seconds = Math.min(MAX_SQS_VISIBILITY_SECONDS, Math.max(0, Math.ceil(retryAfterMs / 1000)));
    try {
        await changeMessageVisibility(queueUrl, record.receiptHandle, seconds);
        logger.info('Deferred rate-limited backfill task until reset', {messageId: record.messageId, deferSeconds: seconds});
    } catch (error) {
        logger.warn('Failed to extend message visibility for rate-limited task; using default timeout', {
            messageId: record.messageId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

/**
 * Backfill worker with two entry modes:
 *
 *   - Direct invoke (no `Records`): the JSON payload is validated as the initial
 *     `discover` task and pushed onto the queue. This is how an operator starts
 *     a run (`aws lambda invoke`).
 *   - SQS invoke (has `Records`): each record is a task, processed with partial
 *     batch failure reporting. Follow-up tasks are self-enqueued for fan-out.
 *     Failed tasks are retried by SQS, then parked in the DLQ.
 */
export const handler = async (event: SQSEvent | unknown): Promise<SQSBatchResponse | void> => {
    if (!initPromise) {
        initPromise = init();
    }
    await initPromise;

    if (!isSqsEvent(event)) {
        const initial = parseInitialTask(event);
        await sendBackfillTasks([initial]);
        logger.info('Seeded backfill run', {
            owner: initial.owner,
            integrationId: initial.integrationId,
            repo: initial.repo,
            eventTypes: initial.eventTypes,
        });
        return;
    }

    const batchItemFailures: {itemIdentifier: string}[] = [];

    for (const record of event.Records) {
        try {
            const task = parseTask(JSON.parse(record.body));
            const followUps = await routeTask(task);
            await sendBackfillTasks(followUps);
        } catch (error) {
            logger.error('Failed to process backfill task', {
                messageId: record.messageId,
                error: error instanceof Error ? error.stack : String(error),
            });

            // On a GitHub rate limit, hold the message until the limit resets so
            // it doesn't exhaust its retries (and hit the DLQ) within the window.
            if (error instanceof GitHubApiError && error.retryAfterMs && error.retryAfterMs > 0) {
                await deferUntilRateLimitReset(record, error.retryAfterMs);
            }

            batchItemFailures.push({itemIdentifier: record.messageId});
        }
    }

    return {batchItemFailures};
};
