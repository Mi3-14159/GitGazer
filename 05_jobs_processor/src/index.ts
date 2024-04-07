import { SQSHandler, SQSEvent, SQSRecord, SQSBatchResponse, SQSBatchItemFailure } from "aws-lambda";
import {getLogger} from './logger';
import { GithubWebhookEvent } from "./types";

const log = getLogger();

export const handler: SQSHandler = async (event: SQSEvent) => {
    log.info({msg: 'handle event', data: event});
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
        try {
            await processRecord(record);
        } catch (error) {
            log.error({msg: `error processing record: ${record.messageId}`, err: error, record});
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }

    const response: SQSBatchResponse = {
        batchItemFailures
    };

    log.info({msg: 'report batch item failures', data: response});
    return response;
}

const processRecord = async (record: SQSRecord) => {
    const githubEvent: GithubWebhookEvent = JSON.parse(record.body);
    log.info({msg: 'process record', data: githubEvent});
}