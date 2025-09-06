import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, QueryCommand, QueryCommandOutput, UpdateCommand} from '@aws-sdk/lib-dynamodb';

import {getLogger} from '@/logger';
import {Job, NotificationRule} from '@/types';

const notificationTableName = process.env.DYNAMO_DB_NOTIFICATIONS_TABLE_ARN;
const jobsTableName = process.env.DYNAMO_DB_JOBS_TABLE_ARN;

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const logger = getLogger();

const query = async <T>(commands: QueryCommand[]): Promise<T[]> => {
    logger.trace('Executing DynamoDB query commands', commands);

    const now = Date.now();
    const result = await Promise.allSettled(commands.map((command) => client.send(command)));
    logger.info(`DynamoDB query execution time: ${Date.now() - now}ms`);

    const fulfilled = result.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<QueryCommandOutput>[];
    const rejected = result.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    if (rejected.length > 0) {
        logger.error(`Failed to get notifications for integration IDs: ${rejected.map((r) => r.reason).join(', ')}`);
    }

    return fulfilled
        .map((r) => {
            return r.value.Items as T[];
        })
        .flat();
};

export const getNotificationRulesBy = async (params: {integrationIds: string[]; limit?: number}): Promise<NotificationRule[]> => {
    logger.info(`Getting notification rules for integrations: ${params.integrationIds.join(', ')}`);

    if (!notificationTableName) {
        throw new Error('DYNAMO_DB_NOTIFICATIONS_TABLE_ARN is not defined');
    }

    const commands = params.integrationIds.map((integrationId) => {
        return new QueryCommand({
            TableName: notificationTableName,
            KeyConditionExpression: 'integrationId = :integrationId',
            ExpressionAttributeValues: {
                ':integrationId': integrationId,
            },
            Limit: params.limit ?? 10,
            IndexName: 'integrationId-index',
        });
    });

    return query<NotificationRule>(commands);
};

export const getJobsBy = async (params: {integrationIds: string[]; limit?: number}): Promise<Job[]> => {
    logger.info(`Getting jobs for integrations: ${params.integrationIds.join(', ')}`);

    if (!jobsTableName) {
        throw new Error('DYNAMO_DB_JOBS_TABLE_ARN is not defined');
    }

    const commands = params.integrationIds.map((integrationId) => {
        return new QueryCommand({
            TableName: jobsTableName,
            KeyConditionExpression: 'integrationId = :integrationId',
            ExpressionAttributeValues: {
                ':integrationId': integrationId,
            },
            Limit: params.limit ?? 50,
            IndexName: 'newest_integration_index',
        });
    });

    return query<Job>(commands);
};

export const putNotificationRule = async (rule: NotificationRule, createOnly?: boolean): Promise<NotificationRule> => {
    logger.info(`Updating notification rule: ${rule.id}`);

    if (!notificationTableName) {
        throw new Error('DYNAMO_DB_NOTIFICATIONS_TABLE_ARN is not defined');
    }

    const now = Date.now();
    const {owner, repository_name, workflow_name, head_branch} = rule.rule;

    const command = new UpdateCommand({
        TableName: notificationTableName,
        Key: {
            id: rule.id ?? crypto.randomUUID(),
            integrationId: rule.integrationId,
        },
        UpdateExpression:
            'SET #created_at = :created_at, #updated_at = :updated_at, #enabled = :enabled, #channels = :channels, #rule = :rule, #ignore_dependabot = :ignore_dependabot',
        ExpressionAttributeNames: {
            '#created_at': 'created_at',
            '#updated_at': 'updated_at',
            '#enabled': 'enabled',
            '#channels': 'channels',
            '#rule': 'rule',
            '#ignore_dependabot': 'ignore_dependabot',
        },
        ExpressionAttributeValues: {
            ':created_at': now,
            ':updated_at': now,
            ':enabled': rule.enabled,
            ':channels': rule.channels,
            ':rule': {owner, repository_name, workflow_name, head_branch},
            ':ignore_dependabot': rule.ignore_dependabot,
        },
        ...(createOnly && {
            ConditionExpression: 'attribute_not_exists(id)',
        }),
        ReturnValues: 'ALL_NEW',
    });

    const result = await client.send(command);
    return result.Attributes as NotificationRule;
};
