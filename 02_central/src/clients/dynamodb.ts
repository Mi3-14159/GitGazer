import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {
    DeleteCommand,
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    QueryCommandOutput,
    TransactGetCommand,
    UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import {getLogger} from '@/logger';
import {WebsocketConnection} from '@/types';
import {Integration, Job, JobType, NotificationRule, NotificationRuleUpdate, ProjectionType} from '@common/types';
import {WorkflowJobEvent, WorkflowRunEvent} from '@octokit/webhooks-types';

const notificationTableName = process.env.DYNAMO_DB_NOTIFICATIONS_TABLE_ARN;
if (!notificationTableName) {
    throw new Error('DYNAMO_DB_NOTIFICATIONS_TABLE_ARN is not defined');
}

const connectionTableName = process.env.DYNAMO_DB_CONNECTIONS_TABLE_ARN;
if (!connectionTableName) {
    throw new Error('DYNAMO_DB_CONNECTIONS_TABLE_ARN is not defined');
}

const jobsTableName = process.env.DYNAMO_DB_JOBS_TABLE_ARN;
if (!jobsTableName) {
    throw new Error('DYNAMO_DB_JOBS_TABLE_ARN is not defined');
}

const integrationsTableName = process.env.DYNAMO_DB_INTEGRATIONS_TABLE_ARN;
if (!integrationsTableName) {
    throw new Error('DYNAMO_DB_INTEGRATIONS_TABLE_ARN is not defined');
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type QueryResult<T> = {items: T[]; lastEvaluatedKey?: {[key: string]: any}};

const query = async <T>(commands: QueryCommand[]): Promise<QueryResult<T>[]> => {
    const logger = getLogger();
    logger.trace(`Executing DynamoDB query commands`, {commands});

    const result = await Promise.allSettled(commands.map((command) => client.send(command)));

    const fulfilled = result.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<QueryCommandOutput>[];
    const rejected = result.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    if (rejected.length > 0) {
        logger.error(`query failed: ${rejected.map((r) => r.reason).join(', ')}`, {rejected});
    }

    const fulfilledResults = fulfilled.map((r) => {
        return {items: r.value.Items as T[], lastEvaluatedKey: r.value.LastEvaluatedKey};
    });

    return fulfilledResults;
};

export const getNotificationRulesBy = async (params: {integrationIds: string[]; limit?: number; id?: string}): Promise<NotificationRule[]> => {
    const logger = getLogger();
    logger.info(`Getting notification rules for integrations`, {integrations: params.integrationIds});

    const keyConditionExpressionParts = ['integrationId = :integrationId'];
    if (params.id) {
        keyConditionExpressionParts.push('id = :id');
    }

    const commands = params.integrationIds.map((integrationId) => {
        return new QueryCommand({
            TableName: notificationTableName,
            KeyConditionExpression: keyConditionExpressionParts.join(' AND '),
            ExpressionAttributeValues: {
                ':integrationId': integrationId,
                ...(params.id && {':id': params.id}),
            },
            IndexName: !params.id ? 'integrationId-index' : undefined,
        });
    });

    return query<NotificationRule>(commands).then((results) => results.flatMap((r) => r.items));
};

export const getJobsBy = async (params: {
    keys: {integrationId: string; id?: string}[];
    filters?: {event_type?: JobType};
    limit?: number;
    projection?: ProjectionType;
    exclusiveStartKeys?: {[key: string]: any};
}): Promise<QueryResult<Job<Partial<WorkflowJobEvent>>>[]> => {
    const logger = getLogger();
    logger.info(`Getting jobs`, {params});

    const projectionExpressionValues = [
        'integrationId',
        'id',
        'created_at',
        'event_type',
        'workflow_event.repository.full_name',
        'workflow_event.workflow_job.workflow_name',
        'workflow_event.workflow_job.#name',
        'workflow_event.workflow_job.head_branch',
        'workflow_event.workflow_job.#status',
        'workflow_event.workflow_job.conclusion',
        'workflow_event.workflow_job.run_id',
        'workflow_event.workflow_job.id',
    ];

    const commands = params.keys.map((keys) => {
        const keyConditionExpressionParts: string[] = [];
        const expressionAttributeValues: {[key: string]: any} = {};
        const filterExpressionParts: string[] = [];

        Object.entries(keys).forEach(([key, value]) => {
            if (value !== undefined) {
                keyConditionExpressionParts.push(`${key} = :${key}`);
                expressionAttributeValues[`:${key}`] = value;
            }
        });

        Object.entries(params.filters ?? {}).forEach(([key, value]) => {
            expressionAttributeValues[`:${key}`] = value;
            filterExpressionParts.push(`${key} = :${key}`);
        });

        return new QueryCommand({
            TableName: jobsTableName,
            KeyConditionExpression: keyConditionExpressionParts.join(' AND '),
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames:
                params.projection === ProjectionType.minimal
                    ? {
                          '#status': 'status',
                          '#name': 'name',
                      }
                    : undefined,
            Limit: params.limit ?? 10,
            IndexName: !keys.id ? 'newest_integration_index' : undefined,
            ScanIndexForward: false,
            ProjectionExpression: params.projection === ProjectionType.minimal ? projectionExpressionValues.join(', ') : undefined,
            FilterExpression: filterExpressionParts.join(' AND '),
            ExclusiveStartKey: params.exclusiveStartKeys?.find((k: {[key: string]: any}) => k.integrationId === keys.integrationId),
        });
    });

    return query<Job<Partial<WorkflowJobEvent>>>(commands);
};

export const putNotificationRule = async (rule: NotificationRuleUpdate, createOnly?: boolean): Promise<NotificationRule> => {
    const logger = getLogger();
    logger.info(`Updating notification rule`, {ruleId: rule.id});

    const now = new Date().toUTCString();
    const {owner, repository_name, workflow_name, head_branch} = rule.rule;

    const command = new UpdateCommand({
        TableName: notificationTableName,
        Key: {
            id: rule.id ?? crypto.randomUUID(),
            integrationId: rule.integrationId,
        },
        UpdateExpression:
            'SET #created_at = if_not_exists(#created_at, :created_at), #updated_at = :updated_at, #enabled = :enabled, #channels = :channels, #rule = :rule, #ignore_dependabot = :ignore_dependabot',
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

export const deleteNotificationRule = async (ruleId: string, integrationId: string): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deleting notification rule`, {ruleId});

    const command = new DeleteCommand({
        TableName: notificationTableName,
        Key: {
            id: ruleId,
            integrationId,
        },
    });

    await client.send(command);
};

export const putJob = async <T extends WorkflowJobEvent | WorkflowRunEvent>(job: Job<T>): Promise<Job<T>> => {
    const logger = getLogger();
    logger.info('Putting job', {
        id: job.id,
    });

    const command = new PutCommand({
        TableName: jobsTableName,
        Item: job,
    });

    await client.send(command);
    return job;
};

export const getConnections = async (integrationId: string): Promise<WebsocketConnection[]> => {
    const logger = getLogger();
    logger.info('Getting connections', {integrationId});

    const queryCommand = new QueryCommand({
        TableName: connectionTableName,
        ConsistentRead: true,
        Limit: 1000,
        KeyConditionExpression: 'integrationId = :integrationId',
        ExpressionAttributeValues: {
            ':integrationId': integrationId,
        },
    });

    const queryData = await client.send(queryCommand);
    return (queryData.Items as WebsocketConnection[]) || [];
};

export const deleteConnection = async (params: {integrationId: string; connectionId: string}): Promise<void> => {
    const logger = getLogger();
    logger.info('Deleting connection', {params});

    const command = new DeleteCommand({
        TableName: connectionTableName,
        Key: params,
    });

    await client.send(command);
};

export const getIntegrations = async (ids: string[]): Promise<Integration[]> => {
    const logger = getLogger();
    logger.info('Getting integrations', {ids});

    if (ids.length === 0) {
        return [];
    }

    // DynamoDB TransactGetItems has a limit of 100 items per transaction
    if (ids.length > 100) {
        throw new Error('Cannot retrieve more than 100 integrations in a single transaction');
    }

    const transactItems = ids.map((id) => ({
        Get: {
            TableName: integrationsTableName,
            Key: {id},
        },
    }));

    const command = new TransactGetCommand({
        TransactItems: transactItems,
    });

    const result = await client.send(command);
    return result.Responses?.map((response) => response.Item as Integration).filter(Boolean) ?? [];
};

export const createIntegration = async (integration: Integration): Promise<Integration> => {
    const logger = getLogger();
    logger.info('Creating integration', {id: integration.id});

    const command = new PutCommand({
        TableName: integrationsTableName,
        Item: integration,
        ConditionExpression: 'attribute_not_exists(id)',
    });

    const result = await client.send(command);
    return result.Attributes as Integration;
};

export const deleteIntegration = async (id: string): Promise<Integration> => {
    const logger = getLogger();
    logger.info('Deleting integration', {id});

    const command = new DeleteCommand({
        TableName: integrationsTableName,
        Key: {id},
        ReturnValues: 'ALL_OLD',
    });

    const result = await client.send(command);
    return result.Attributes as Integration;
};
