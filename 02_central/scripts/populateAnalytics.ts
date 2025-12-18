import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {FirehoseClient, PutRecordBatchCommand} from '@aws-sdk/client-firehose';
import {DynamoDBDocumentClient, ScanCommand} from '@aws-sdk/lib-dynamodb';

const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const firehoseClient = new FirehoseClient();

const main = async () => {
    const scanCommand = new ScanCommand({
        TableName: process.env.DYNAMO_DB_JOBS_TABLE_ARN,
        FilterExpression: 'event_type = :eventType',
        ExpressionAttributeValues: {
            ':eventType': 'workflow_job',
        },
        Limit: 500,
    });

    while (true) {
        const scanResponse = await dynamoDBClient.send(scanCommand);

        const items = scanResponse.Items;
        if (!items || items.length === 0) {
            console.log('No more items to process. Exiting.');
            break;
        }

        console.log(`Processing ${items.length} items...`);

        const records = items.map((item) => {
            const firehoseRecord = {
                integration_id: item.integrationId,
                id: item.id,
                completed_at: item.workflow_event.workflow_job.completed_at,
                owner: item.workflow_event.repository.owner.login,
                repo: item.workflow_event.repository.name,
                workflow: item.workflow_event.workflow_job.name,
                job: item.workflow_event.workflow_job.name,
                status: item.workflow_event.workflow_job.status,
                conclusion: item.workflow_event.workflow_job.conclusion,
                sender: item.workflow_event.sender.login,
                branch: item.workflow_event.workflow_job.head_branch,
            };

            const data = JSON.stringify(firehoseRecord) + '\n';
            return {
                Data: new TextEncoder().encode(data),
            };
        });

        const putRecordCommand = new PutRecordBatchCommand({
            DeliveryStreamName: process.env.FIREHOSE_STREAM_NAME,
            Records: records,
        });

        try {
            const response = await firehoseClient.send(putRecordCommand);
            console.log(
                `successfully sent ${response.RequestResponses?.length ?? 0} records, failed ${response.FailedPutCount ?? 0} records, last evaluated key: ${scanResponse.LastEvaluatedKey?.integration_id} - ${scanResponse.LastEvaluatedKey?.id}`,
            );
        } catch (error) {
            console.error('Error sending record:', error);
            console.error(`Last evaluated key: ${scanResponse.LastEvaluatedKey?.integration_id} - ${scanResponse.LastEvaluatedKey?.id}`);
        }

        // If LastEvaluatedKey is not present, we have scanned all items
        if (!scanResponse.LastEvaluatedKey) {
            console.log('Scanned all items. Exiting.');
            break;
        }

        // Set the ExclusiveStartKey for the next scan operation
        scanCommand.input.ExclusiveStartKey = scanResponse.LastEvaluatedKey;
    }
};

main();
