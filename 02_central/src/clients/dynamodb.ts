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

import {getLogger} from '@/logger';
import {WebsocketConnection} from '@/types';
import {Integration, NotificationRule, ProjectionType, Workflow, WorkflowEvent, WorkflowType} from '@common/types';

const notificationTableName = process.env.DYNAMO_DB_NOTIFICATIONS_TABLE_ARN;
if (!notificationTableName) {
    throw new Error('DYNAMO_DB_NOTIFICATIONS_TABLE_ARN is not defined');
}

const notificationTableIntegrationIdIndexName = process.env.DYNAMO_DB_NOTIFICATIONS_INTEGRATION_ID_INDEX_NAME;
if (!notificationTableIntegrationIdIndexName) {
    throw new Error('DYNAMO_DB_NOTIFICATIONS_INTEGRATION_ID_INDEX_NAME is not defined');
}

const connectionTableName = process.env.DYNAMO_DB_CONNECTIONS_TABLE_ARN;
if (!connectionTableName) {
    throw new Error('DYNAMO_DB_CONNECTIONS_TABLE_ARN is not defined');
}

const workflowsTableName = process.env.DYNAMO_DB_WORKFLOWS_TABLE_ARN;
if (!workflowsTableName) {
    throw new Error('DYNAMO_DB_WORKFLOWS_TABLE_ARN is not defined');
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

    return fulfilledResults;
};

export const getNotificationRulesBy = async (params: {integrationIds: string[]; limit?: number; id?: string}): Promise<NotificationRule[]> => {
    const logger = getLogger();
    logger.info(`Getting notification rules for integrations ${params.integrationIds.join(', ')}`, {integrations: params.integrationIds});

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

export const getWorkflowsBy = async <T extends WorkflowType>(params: {
    keys: {integrationId: string; id?: string}[];
    filters?: {event_type?: T};
    limit?: number;
    projection?: ProjectionType;
    exclusiveStartKeys?: {[key: string]: any};
}): Promise<QueryResult<Workflow<Partial<WorkflowEvent<T>>>>[]> => {
    const logger = getLogger();
    logger.info(`Getting workflows`, {params});

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
        'workflow_event.workflow_run.#name',
        'workflow_event.workflow_run.head_branch',
        'workflow_event.workflow_run.#status',
        'workflow_event.workflow_run.conclusion',
        'workflow_event.workflow_run.id',
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
            TableName: workflowsTableName,
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
            FilterExpression: filterExpressionParts.length ? filterExpressionParts.join(' AND ') : undefined,
            ExclusiveStartKey: params.exclusiveStartKeys?.find((k: {[key: string]: any}) => k.integrationId === keys.integrationId),
        });
    });

    return query<Workflow<Partial<WorkflowEvent<T>>>>(commands);
};

export const putNotificationRule = async (
    rule: Omit<NotificationRule, 'createdAt' | 'updatedAt'>,
    createOnly?: boolean,
): Promise<NotificationRule> => {
    const logger = getLogger();
    logger.info(`Updating notification rule ${rule.id}`, {rule, createOnly});

    const now = new Date().toUTCString();
    const {owner, repository_name, workflow_name, head_branch} = rule.rule;

    const command = new UpdateCommand({
        TableName: notificationTableName,
        Key: {
            id: rule.id,
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

    logger.trace('Update command for putting notification rule', {command});
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

export const putWorkflow = async <T extends WorkflowEvent<any>>(workflow: Workflow<T>): Promise<Workflow<T>> => {
    const logger = getLogger();
    logger.info(`Putting workflow ${workflow.id}`, {
        id: workflow.id,
    });

    const command = new PutCommand({
        TableName: workflowsTableName,
        Item: workflow,
    });

    await client.send(command);
    return workflow;
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

export const createIntegration = async (integration: Integration, userId: string): Promise<Integration> => {
    const logger = getLogger();
    logger.info(`Creating integration ${integration.id}`, {id: integration.id, userId});

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
                        userId,
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

export const deleteIntegrationNotificationRules = async (integrationId: string): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deleting all notification rules of integration ${integrationId}`, {integrationId});

    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
        const queryCommand = new QueryCommand({
            TableName: notificationTableName,
            KeyConditionExpression: 'integrationId = :integrationId',
            ExpressionAttributeValues: {
                ':integrationId': integrationId,
            },
            IndexName: notificationTableIntegrationIdIndexName,
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
                        [notificationTableName]: chunk.map((item) => ({
                            DeleteRequest: {
                                Key: {
                                    id: item.id,
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
                logger.error(`Failed to delete some notification rules of integration ${integrationId} in batch write`, {
                    integrationId,
                    error: batchWriteResult.reason,
                });
            } else {
                const batchWriteCommand = batchWriteResult.value;
                if (batchWriteCommand.UnprocessedItems && Object.keys(batchWriteCommand.UnprocessedItems).length > 0) {
                    logger.error(`Some notification rules of integration ${integrationId} were not deleted in batch write`, {
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
