import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, GetCommandOutput, QueryCommand} from '@aws-sdk/lib-dynamodb';

import {getLogger} from '@/logger';
import {NotificationRule} from '@/types';

const notificationTableName = process.env.DYNAMO_DB_NOTIFICATIONS_TABLE_ARN;
if (!notificationTableName) {
    throw new Error('DYNAMO_DB_NOTIFICATIONS_TABLE_ARN is not defined');
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const log = getLogger();

export const getNotificationRules = async (params: {integrationIds: string[]; limit?: 10}): Promise<NotificationRule[]> => {
    log.info(`Getting notification rules for integration IDs: ${params.integrationIds.join(', ')}`);

    const commands = params.integrationIds.map((integrationId) => {
        return new QueryCommand({
            TableName: notificationTableName,
            KeyConditionExpression: 'integrationId = :integrationId',
            ExpressionAttributeValues: {
                ':integrationId': integrationId,
            },
            Limit: params.limit,
        });
    });

    const result = await Promise.allSettled(commands.map((command) => client.send(command)));
    // handle results
    const fulfilled = result.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<GetCommandOutput>[];
    const rejected = result.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    if (rejected.length > 0) {
        log.error(`Failed to get notifications for integration IDs: ${rejected.map((r) => r.reason).join(', ')}`);
    }

    return fulfilled.map((r) => r.value.Item as NotificationRule);
};
