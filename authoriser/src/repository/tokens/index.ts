import {PutCommandOutput} from '@aws-sdk/lib-dynamodb';

import {getLogger} from '../../logger';
import {getItem, putItem} from '../_base';
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
    const response = await getItem(tableName, key, true);

    if (!response.Item) {
        return undefined;
    }

    if (!isToken(response.Item)) {
        throw new RepositoryError(`Invalid token for user name ${userName} and token type ${tokenType}`, response.Item);
    }

    return response.Item;
};

const put = (token: Token): Promise<PutCommandOutput> => {
    if (!isToken(token)) {
        throw new RepositoryError(`Invalid token`, token);
    }

    log.debug({data: {token}, msg: 'put token'});
    return putItem(tableName, token);
};

export const tokenRepository = {
    get,
    put,
};