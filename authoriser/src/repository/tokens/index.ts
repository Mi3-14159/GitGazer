import {PutCommandOutput} from '@aws-sdk/lib-dynamodb';

import {getLogger} from '../../logger';
import {putItem, queryItems} from '../_base';
import { RepositoryError } from '../errors';
import { Token, TokenType, isToken } from '../../models/dynamodb';

const tableName = process.env.TOKENS_TABLE_NAME;
if (!tableName) {
    throw new RepositoryError('TOKENS_TABLE_NAME is not defined');
}

const log = getLogger();

const get = async (userName: string, tokenType: TokenType): Promise<Token | undefined> => {
    const key: Record<string, unknown> = {
        userName,
        tokenType,
    };
    log.debug({data: {key}, msg: 'get token'});

    const response = await queryItems({
        TableName: tableName,
        KeyConditionExpression: "#userHandle = :userHandle AND #tokenType = :tokenType",
        ExpressionAttributeNames: {
            "#userHandle": "userHandle",
            "#tokenType": "tokenType",
            "#expireAt": "expireAt",
        },
        ExpressionAttributeValues: {
            ":userHandle": userName,
            ":tokenType": tokenType,
            ":currentTime": Math.floor(new Date().getTime() / 1000),
        },
        FilterExpression: "#expireAt > :currentTime",
    });

    if (!response.Items || response.Items.length === 0) {
        return undefined;
    }

    if (response.Items.length > 1) {
        throw new RepositoryError(`Multiple tokens for user name ${userName} and token type ${tokenType}`);
    }

    const token = response.Items[0];
    if (!isToken(token)) {
        throw new RepositoryError(`Invalid token for user name ${userName} and token type ${tokenType}`);
    }

    return token;
};

const put = (token: Token): Promise<PutCommandOutput> => {
    if (!isToken(token)) {
        throw new RepositoryError(`Invalid token`, token);
    }

    log.debug({data: {token}, msg: 'put token'});
    return putItem({
        TableName: tableName,
        Item: token,
    });
};

export const tokenRepository = {
    get,
    put,
};