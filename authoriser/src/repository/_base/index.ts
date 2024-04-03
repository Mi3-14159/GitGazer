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
    QueryCommandInput,
    UpdateCommandInput,
    GetCommandInput,
    PutCommandInput,
} from '@aws-sdk/lib-dynamodb';

import {getLogger} from '../../logger';
import {getClient} from '../../dynamodb';

const client = getClient();
const log = getLogger();

export const putItem = (putCommandInput: PutCommandInput): Promise<PutCommandOutput> => {
    const command = new PutCommand(putCommandInput);

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

export const getItem = (getCommandInput: GetCommandInput): Promise<GetCommandOutput> => {
    const command = new GetCommand(getCommandInput);

    log.trace({data: {command}, msg: 'getItem'});
    return client.send(command);
};

export const updateItem = (updateCommandInput: UpdateCommandInput): Promise<UpdateCommandOutput> => {
    const command = new UpdateCommand(updateCommandInput);

    log.trace({data: {command}, msg: 'updateItem'});
    return client.send(command);
};

export const queryItems = (queryCommandInput: QueryCommandInput): Promise<QueryCommandOutput> => {
    const command = new QueryCommand(queryCommandInput);

    log.trace({data: {command}, msg: 'query'});
    return client.send(command);
};