import {getLogger} from '@/logger';
import {FirehoseClient, PutRecordBatchCommand} from '@aws-sdk/client-firehose';
import {unmarshall} from '@aws-sdk/util-dynamodb';
import {Job} from '@common/types';
import {WorkflowJobEvent} from '@octokit/webhooks-types';
import {DynamoDBBatchResponse, DynamoDBStreamHandler} from 'aws-lambda';

const firehoseStreamName = process.env.FIREHOSE_STREAM_NAME;
if (!firehoseStreamName) {
    throw new Error('FIREHOSE_STREAM_NAME is not defined');
}

const logger = getLogger();
const client = new FirehoseClient();

export const handler: DynamoDBStreamHandler = async (event, context) => {
    logger.resetKeys();
    logger.addContext(context);
    logger.logEventIfEnabled(event);

    const result: DynamoDBBatchResponse = {
        batchItemFailures: [],
    };

    const encoder = new TextEncoder();
    const batchItems: Array<{eventId?: string; data: Uint8Array}> = [];

    event.Records.forEach((record) => {
        const item = unmarshall(record.dynamodb?.NewImage as unknown as Record<string, any>) as Job<WorkflowJobEvent>;
        const firehoseItem = createFirehoseItem(item);
        batchItems.push({
            eventId: record.eventID,
            data: encoder.encode(firehoseItem),
        });
    });

    if (!batchItems.length) {
        logger.info('no items to process');
        logger.flushBuffer();
        return result;
    }

    try {
        const command = new PutRecordBatchCommand({
            DeliveryStreamName: firehoseStreamName,
            Records: batchItems.map(({data}) => ({Data: data})),
        });

        const response = await client.send(command);

        response.RequestResponses?.forEach((resp, index) => {
            if (!resp.ErrorCode) {
                return;
            }

            const failedRecord = batchItems[index];
            if (failedRecord?.eventId) {
                result.batchItemFailures.push({itemIdentifier: failedRecord.eventId});
            }

            logger.error('Firehose batch record failed', {
                errorCode: resp.ErrorCode,
                errorMessage: resp.ErrorMessage,
                eventId: failedRecord?.eventId,
            });
        });
    } catch (error) {
        logger.error('Firehose batch send failed', error as Error);

        for (const item of batchItems) {
            if (item.eventId) {
                result.batchItemFailures.push({itemIdentifier: item.eventId});
            }
        }
    }

    logger.flushBuffer();
    return result;
};

const createFirehoseItem = (event: Job<WorkflowJobEvent>): string => {
    const item = {
        integration_id: event.integrationId,
        id: event.id,
        completed_at: event.workflow_event.workflow_job.completed_at,
        owner: event.workflow_event.repository.owner.login,
        repo: event.workflow_event.repository.name,
        workflow: event.workflow_event.workflow_job.name,
        job: event.workflow_event.workflow_job.name,
        status: event.workflow_event.workflow_job.status,
        conclusion: event.workflow_event.workflow_job.conclusion,
        sender: event.workflow_event.sender.login,
        branch: event.workflow_event.workflow_job.head_branch,
    };

    return JSON.stringify(item) + '\n';
};
