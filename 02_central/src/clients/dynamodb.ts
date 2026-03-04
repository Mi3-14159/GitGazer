import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {
    BatchWriteCommand,
    DeleteCommand,
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    QueryCommandOutput,
    TransactGetCommand,
    TransactWriteCommand,
    UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import {Event, Integration, ProjectionType} from '@/common/types';
import {getLogger} from '@/logger';
import {WebsocketConnection} from '@/types';
import type {EventPayloadMap} from '@octokit/webhooks-types';

const connectionTableName = process.env.DYNAMO_DB_CONNECTIONS_TABLE_ARN;
if (!connectionTableName) {
    throw new Error('DYNAMO_DB_CONNECTIONS_TABLE_ARN is not defined');
}

const eventsTableName = process.env.DYNAMO_DB_EVENTS_TABLE_ARN;
if (!eventsTableName) {
    throw new Error('DYNAMO_DB_EVENTS_TABLE_ARN is not defined');
}

const integrationsTableName = process.env.DYNAMO_DB_INTEGRATIONS_TABLE_ARN;
if (!integrationsTableName) {
    throw new Error('DYNAMO_DB_INTEGRATIONS_TABLE_ARN is not defined');
}

const userAssignmentsTableName = process.env.DYNAMO_DB_USER_ASSIGNMENTS_TABLE_ARN;
if (!userAssignmentsTableName) {
    throw new Error('DYNAMO_DB_USER_ASSIGNMENTS_TABLE_ARN is not defined');
}

const userQueriesTableName = process.env.DYNAMO_DB_USER_QUERIES_TABLE_ARN;
if (!userQueriesTableName) {
    throw new Error('DYNAMO_DB_USER_QUERIES_TABLE_ARN is not defined');
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

    logger.trace(`DynamoDB query results`, {fulfilledResults});
    return fulfilledResults;
};

export const getWorkflowsBy = async <T extends 'workflow_job' | 'workflow_run'>(params: {
    keys: {integrationId: string; id?: string}[];
    filters?: {event_type?: T[]};
    limit?: number;
    projection?: ProjectionType;
    exclusiveStartKeys?: {[key: string]: any};
}): Promise<QueryResult<Event<Partial<EventPayloadMap[T]>>>[]> => {
    const logger = getLogger();
    logger.info(`Getting workflows`, {params});

    const projectionExpressionValues = [
        'integrationId',
        'id',
        'created_at',
        'event_type',
        'event.repository.full_name',
        'event.workflow_job.workflow_name',
        'event.workflow_job.#name',
        'event.workflow_job.head_branch',
        'event.workflow_job.#status',
        'event.workflow_job.conclusion',
        'event.workflow_job.run_id',
        'event.workflow_job.id',
        'event.workflow_run.#name',
        'event.workflow_run.head_branch',
        'event.workflow_run.#status',
        'event.workflow_run.conclusion',
        'event.workflow_run.id',
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

        if (!params.filters?.event_type) {
            keyConditionExpressionParts.push('event_type_group = :event_type_group');
            expressionAttributeValues[':event_type_group'] = 'workflow';
        }

        Object.entries(params.filters ?? {}).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                filterExpressionParts.push(`${key} IN (${value.map((_, i) => `:filter_${key}_${i}`).join(', ')})`);
                value.forEach((v, i) => {
                    expressionAttributeValues[`:filter_${key}_${i}`] = v;
                });
            } else if (value !== undefined) {
                filterExpressionParts.push(`${key} = :${key}`);
                expressionAttributeValues[`:${key}`] = value;
            }
        });

        return new QueryCommand({
            TableName: eventsTableName,
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
            IndexName: !keys.id && !params.filters?.event_type ? 'newestEventsByType' : undefined,
            ScanIndexForward: false,
            ProjectionExpression: params.projection === ProjectionType.minimal ? projectionExpressionValues.join(', ') : undefined,
            FilterExpression: filterExpressionParts.length ? filterExpressionParts.join(' AND ') : undefined,
            ExclusiveStartKey: params.exclusiveStartKeys?.find((k: {[key: string]: any}) => k.integrationId === keys.integrationId),
        });
    });

    return await query<Event<Partial<EventPayloadMap[T]>>>(commands);
};

export const putEvent = async <T extends keyof EventPayloadMap>(
    event: Omit<Event<EventPayloadMap[T]>, 'created_at'>,
): Promise<Event<EventPayloadMap[T]>> => {
    const logger = getLogger();
    logger.info(`Putting event ${event.integrationId}.${event.id}`, {
        integrationId: event.integrationId,
        id: event.id,
        event,
    });

    const updateExpressionParts: string[] = ['#created_at = if_not_exists(#created_at, :created_at)', '#updated_at = :updated_at'];
    const expressionAttributeNames: {[key: string]: string} = {
        '#created_at': 'created_at',
        '#updated_at': 'updated_at',
    };
    const expressionAttributeValues: {[key: string]: any} = {
        ':created_at': new Date().toISOString(),
        ':updated_at': new Date().toISOString(),
    };

    Object.keys(event)
        .filter((key) => !['integrationId', 'id'].includes(key))
        .forEach((key) => {
            const value = (event as any)[key];
            if (!value) {
                return;
            }

            updateExpressionParts.push(`#${key} = :${key}`);
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = value;
        });

    const command = new UpdateCommand({
        TableName: eventsTableName,
        Key: {
            integrationId: event.integrationId,
            id: event.id,
        },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
    });

    const result = await client.send(command);
    return result.Attributes as Event<EventPayloadMap[T]>;
};

export const getConnections = async (integrationId: string): Promise<WebsocketConnection[]> => {
    const logger = getLogger();
    logger.info(`Getting connections for integration ${integrationId}`, {integrationId});

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
    logger.info(`Deleting connection ${params.connectionId} for integration ${params.integrationId}`, {params});

    const command = new DeleteCommand({
        TableName: connectionTableName,
        Key: params,
    });

    await client.send(command);
};

export const getIntegrations = async (ids: string[]): Promise<Integration[]> => {
    const logger = getLogger();
    logger.info(`Getting integrations ${ids.join(', ')}`, {ids});

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
    logger.info(`Creating integration ${integration.id} with owner ${integration.owner}`);

    const command = new TransactWriteCommand({
        TransactItems: [
            {
                Put: {
                    TableName: integrationsTableName,
                    Item: integration,
                    ConditionExpression: 'attribute_not_exists(id)',
                },
            },
            {
                Put: {
                    TableName: userAssignmentsTableName,
                    Item: {
                        userId: integration.owner,
                        integrationId: integration.id,
                    },
                },
            },
        ],
    });

    await client.send(command);
    return integration;
};

export const updateIntegration = async (id: string, label: string): Promise<Integration> => {
    const logger = getLogger();
    logger.info(`Updating integration ${id} with label: ${label}`, {id, label});

    const command = new UpdateCommand({
        TableName: integrationsTableName,
        Key: {id},
        UpdateExpression: 'SET label = :label',
        ExpressionAttributeValues: {
            ':label': label,
        },
        ConditionExpression: 'attribute_exists(id)',
        ReturnValues: 'ALL_NEW',
    });

    const result = await client.send(command);
    return result.Attributes as Integration;
};

export const deleteIntegration = async (id: string): Promise<Integration> => {
    const logger = getLogger();
    logger.info(`Deleting integration ${id}`, {id});

    const command = new DeleteCommand({
        TableName: integrationsTableName,
        Key: {id},
        ReturnValues: 'ALL_OLD',
    });

    const result = await client.send(command);
    return result.Attributes as Integration;
};

export const getUserIntegrations = async (userId: string): Promise<string[]> => {
    const logger = getLogger();
    logger.info(`Getting integrations for user ${userId}`, {userId});

    const command = new QueryCommand({
        TableName: userAssignmentsTableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId,
        },
    });

    logger.trace('Query command for getting user integrations', {command});
    const result = await client.send(command);
    if (!result.Items) {
        return [];
    }

    return result.Items.map((item) => item.integrationId);
};

export const addUserToIntegration = async (userId: string, integrationId: string): Promise<void> => {
    const logger = getLogger();
    logger.info(`Adding user ${userId} to integration ${integrationId}`, {userId, integrationId});

    const command = new PutCommand({
        TableName: userAssignmentsTableName,
        Item: {
            userId,
            integrationId,
        },
    });

    await client.send(command);
};

export const removeUserFromIntegration = async (userId: string, integrationId: string): Promise<void> => {
    const logger = getLogger();
    logger.info(`Removing user ${userId} from integration ${integrationId}`, {userId, integrationId});

    const command = new DeleteCommand({
        TableName: userAssignmentsTableName,
        Key: {
            userId,
            integrationId,
        },
    });

    await client.send(command);
};

// TODO: extract the deletion of all members into an async process
// maybe a dedicated lambda function execution triggered by a sqs?
export const deleteIntegrationMembers = async (integrationId: string): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deleting all members of integration ${integrationId}`, {integrationId});

    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
        const queryCommand = new QueryCommand({
            TableName: userAssignmentsTableName,
            IndexName: 'integrationId-index',
            KeyConditionExpression: 'integrationId = :integrationId',
            ExpressionAttributeValues: {
                ':integrationId': integrationId,
            },
            ExclusiveStartKey: lastEvaluatedKey,
        });

        const result = await client.send(queryCommand);
        lastEvaluatedKey = result.LastEvaluatedKey;

        if (!result.Items || result.Items.length === 0) {
            continue;
        }

        // Split items into chunks of 25 for BatchWriteItem
        const chunks: any[][] = [];
        for (let i = 0; i < result.Items.length; i += 25) {
            chunks.push(result.Items.slice(i, i + 25));
        }

        const batchPromises = chunks.map((chunk) => {
            return client.send(
                new BatchWriteCommand({
                    RequestItems: {
                        [userAssignmentsTableName]: chunk.map((item) => ({
                            DeleteRequest: {
                                Key: {
                                    userId: item.userId,
                                    integrationId: integrationId,
                                },
                            },
                        })),
                    },
                }),
            );
        });

        const results = await Promise.allSettled(batchPromises);
        results.forEach((batchWriteResult) => {
            if (batchWriteResult.status === 'rejected') {
                logger.error(`Failed to delete some members of integration ${integrationId} in batch write`, {
                    integrationId,
                    error: batchWriteResult.reason,
                });
            } else {
                const batchWriteCommand = batchWriteResult.value;
                if (batchWriteCommand.UnprocessedItems && Object.keys(batchWriteCommand.UnprocessedItems).length > 0) {
                    logger.error(`Some members of integration ${integrationId} were not deleted in batch write`, {
                        integrationId,
                        unprocessedItems: batchWriteCommand.UnprocessedItems,
                    });
                }
            }
        });
    } while (lastEvaluatedKey);
};

export const putUserQuery = async (userId: string, queryId: string): Promise<void> => {
    const logger = getLogger();
    logger.info(`Associating query ${queryId} with user ${userId}`, {userId, queryId});

    const command = new PutCommand({
        TableName: userQueriesTableName,
        Item: {
            userId,
            queryId,
            expireAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days from now
        },
    });

    await client.send(command);
};

export const isUserQuery = async (userId: string, queryId: string): Promise<boolean> => {
    const logger = getLogger();
    logger.info(`Getting queries for user ${userId}`, {userId});

    const command = new QueryCommand({
        TableName: userQueriesTableName,
        KeyConditionExpression: 'userId = :userId AND queryId = :queryId',
        ExpressionAttributeValues: {
            ':userId': userId,
            ':queryId': queryId,
            ':now': Math.floor(Date.now() / 1000),
        },
        FilterExpression: 'expireAt > :now',
    });

    logger.trace('Query command for getting user query', {command});
    const result = await client.send(command);

    return (result.Items?.length ?? 0) > 0;
};
