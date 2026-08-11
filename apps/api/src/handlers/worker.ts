import {processRecord} from '@/domains/webhooks/worker/batch-processor';
import '@gitgazer/backend-core/bootstrap';
import {loadConfig} from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {initDb} from '@gitgazer/db/client';
import type {SQSBatchResponse, SQSEvent} from 'aws-lambda';

const logger = getLogger();
let initPromise: Promise<void> | null = null;

const init = async (): Promise<void> => {
    await initDb();
    await loadConfig();
};

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
    if (!initPromise) {
        initPromise = init();
    }
    await initPromise;

    const batchItemFailures: {itemIdentifier: string}[] = [];

    for (const record of event.Records) {
        try {
            await processRecord(record);
        } catch (error) {
            logger.error('Failed to process SQS record', {messageId: record.messageId, error});
            batchItemFailures.push({itemIdentifier: record.messageId});
        }
    }

    return {batchItemFailures};
};
