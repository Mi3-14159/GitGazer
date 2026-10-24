import {processRecord} from './batch-processor';
import '@gitgazer/backend-core/bootstrap';
import config, {loadConfig} from '@gitgazer/backend-core/config';
import {createLimiter} from '@gitgazer/backend-core/helpers/async';
import {getLogger} from '@gitgazer/backend-core/logger';
import {sendWorkflowJobAlerts} from '@gitgazer/backend-services/alerting.controller';
import {initDb} from '@gitgazer/db/client';
import type {Context, SQSBatchResponse, SQSEvent} from 'aws-lambda';

const logger = getLogger();
let initPromise: Promise<void> | null = null;

const init = async (): Promise<void> => {
    await initDb();
    await loadConfig();
};

export const handler = async (event: SQSEvent, context: Context): Promise<SQSBatchResponse> => {
    if (!initPromise) {
        initPromise = init();
    }
    await initPromise;

    const batchItemFailures: {itemIdentifier: string}[] = [];
    const limit = createLimiter(config.get('alerts').concurrency);
    const alerts: Promise<void>[] = [];

    for (const record of event.Records) {
        try {
            const job = await processRecord(record);
            if (job) {
                // Started right away rather than after the loop: a replayed batch skips already-saved jobs as stale,
                // so an alert still waiting when the invocation dies would be lost.
                alerts.push(
                    limit(() => sendWorkflowJobAlerts(job, {getRemainingTimeMs: () => context.getRemainingTimeInMillis()})).catch((error) => {
                        logger.error('Failed to send workflow job alerts', {jobId: job.id, integrationId: job.integrationId, error});
                    }),
                );
            }
        } catch (error) {
            logger.error('Failed to process SQS record', {messageId: record.messageId, error});
            batchItemFailures.push({itemIdentifier: record.messageId});
        }
    }

    await Promise.all(alerts);

    return {batchItemFailures};
};
