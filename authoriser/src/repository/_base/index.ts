import {
    GetCommand,
    GetCommandOutput,
    PutCommand,
    PutCommandOutput,
    QueryCommandOutput,
    UpdateCommand,
    QueryCommand,
    BatchWriteCommand,
    BatchWriteCommandOutput,
    UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {ReturnValue} from '@aws-sdk/client-dynamodb/dist-types/models/models_0';

import {getLogger} from '../../logger';
import {getClient} from '../../dynamodb';

const client = getClient();
const log = getLogger();

export const putItem = (tableName: string, item: unknown, returnValue?: ReturnValue): Promise<PutCommandOutput> => {
    const command = new PutCommand({
        TableName: tableName,
        Item: item,
        ReturnValues: returnValue || 'NONE',
    });

    log.trace({data: {command}, msg: 'putItem'});
    return client.send(command);
};

export const batchPutItem = (tableName: string, items: unknown[]): Promise<BatchWriteCommandOutput> => {
    const command = new BatchWriteCommand({
        RequestItems: {
            [tableName]: items.map((item) => {
                return {
                    PutRequest: {
                        Item: item,
                    },
                };
            }),
        },
    });

    log.trace({data: {command}, msg: 'batchPutItem'});
    return client.send(command);
};

export const getItem = (tableName: string, key: Record<string, unknown>, consistentRead?: boolean): Promise<GetCommandOutput> => {
    const command = new GetCommand({
        TableName: tableName,
        Key: key,
        ConsistentRead: consistentRead || false,
    });

    log.trace({data: {command}, msg: 'getItem'});
    return client.send(command);
};

export const updateItem = (
    tableName: string, key: Record<string, unknown>,
    updateExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    conditionExpression?:string,
    returnValues?: ReturnValue,
): Promise<UpdateCommandOutput> => {
    const command = new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: conditionExpression,
        ReturnValues: returnValues,
    });

    log.trace({data: {command}, msg: 'updateItem'});
    return client.send(command);
};

export const queryItems = (
    tableName: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, unknown>,
    keyConditionExpression?: string,
    indexName?: string,
    filterExpression?: string,
    exclusiveStartKey?: Record<string, unknown>,
): Promise<QueryCommandOutput> => {
    const command = new QueryCommand({
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        FilterExpression: filterExpression,
        ExclusiveStartKey: exclusiveStartKey,
    });

    log.trace({data: {command}, msg: 'query'});
    return client.send(command);
};