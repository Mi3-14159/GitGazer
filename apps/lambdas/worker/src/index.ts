import {processRecord} from './batch-processor';
import '@gitgazer/backend-core/bootstrap';
import config, {loadConfig} from '@gitgazer/backend-core/config';
import {mapWithConcurrency} from '@gitgazer/backend-core/helpers/async';
import {getLogger} from '@gitgazer/backend-core/logger';
import {sendWorkflowJobAlerts} from '@gitgazer/backend-services/alerting.controller';
import {initDb} from '@gitgazer/db/client';
import type {WorkflowJobWithRelations} from '@gitgazer/db/types';
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

    const jobs: WorkflowJobWithRelations[] = [];

    for (const record of event.Records) {
        try {
            const job = await processRecord(record);
            if (job) {
                jobs.push(job);
            }
        } catch (error) {
            logger.error('Failed to process SQS record', {messageId: record.messageId, error});
            batchItemFailures.push({itemIdentifier: record.messageId});
        }
    }

    // Alerts run after ingestion so slow enrichment never delays record processing
    const results = await mapWithConcurrency(jobs, config.get('alerts').concurrency, (job) =>
        sendWorkflowJobAlerts(job, {getRemainingTimeMs: () => context.getRemainingTimeInMillis()}),
    );
    results.forEach((result, i) => {
        if (result.status === 'rejected') {
            logger.error('Failed to send workflow job alerts', {
                jobId: jobs[i].id,
                integrationId: jobs[i].integrationId,
                error: result.reason,
            });
        }
    });

    return {batchItemFailures};
};
