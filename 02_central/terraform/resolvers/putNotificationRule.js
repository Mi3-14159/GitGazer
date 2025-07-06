import {util} from '@aws-appsync/utils';

/**
 * Puts an item into the DynamoDB table.
 * @param {import('@aws-appsync/utils').Context<{input: any}>} ctx the context
 * @returns {import('@aws-appsync/utils').DynamoDBUpdateItemRequest} the request
 */
export function request(ctx) {
    const {integrationId, owner, repository_name, workflow_name, enabled, channels} = ctx.args.input;

    if (util.authType() === 'User Pool Authorization') {
        if (!ctx.identity['groups'].includes(integrationId)) {
            util.unauthorized();
        }
    }

    const idParts = [owner, ...(repository_name ? [repository_name] : []), ...(workflow_name ? [workflow_name] : [])];

    const key = {id: idParts.join('/')};
    const now = util.time.nowISO8601();

    return {
        operation: 'UpdateItem',
        key: {
            id: util.dynamodb.toDynamoDB(key.id),
            integrationId: util.dynamodb.toDynamoDB(integrationId),
        },
        update: {
            expression:
                'SET #created_at = if_not_exists(#created_at, :created_at), #updated_at = :updated_at, #enabled = :enabled, #channels = :channels',
            expressionNames: {
                '#created_at': 'created_at',
                '#updated_at': 'updated_at',
                '#enabled': 'enabled',
                '#channels': 'channels',
            },
            expressionValues: {
                ':created_at': util.dynamodb.toDynamoDB(now),
                ':updated_at': util.dynamodb.toDynamoDB(now),
                ':enabled': util.dynamodb.toDynamoDB(enabled),
                ':channels': util.dynamodb.toDynamoDB(channels),
            },
        },
    };
}

/**
 * Returns the item or throws an error if the operation failed.
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the result
 */
export function response(ctx) {
    const {error, result} = ctx;
    if (error) {
        return util.appendError(error.message, error.type, result);
    }

    const {id} = result;
    const [owner, repository_name, workflow_name] = id.split('/');
    return {
        ...result,
        owner,
        repository_name: repository_name || null,
        workflow_name: workflow_name || null,
    };
}
