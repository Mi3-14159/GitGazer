import { SQSHandler, SQSEvent, SQSRecord } from "aws-lambda";
import {getLogger} from './logger';
import { GithubWebhookEvent } from "./types";

const log = getLogger();

export const handler: SQSHandler = async (event: SQSEvent) => {
    log.info({msg: 'handle event', data: event});
    for (const record of event.Records) {
        await processRecord(record);
    }
}

const processRecord = async (record: SQSRecord) => {
    const githubEvent: GithubWebhookEvent = JSON.parse(record.body);
    log.info({msg: 'process record', data: githubEvent});
}