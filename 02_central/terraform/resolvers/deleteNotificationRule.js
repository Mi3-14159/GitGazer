import {util} from '@aws-appsync/utils';

/**
 * Puts an item into the DynamoDB table.
 * @param {import('@aws-appsync/utils').Context<{input: any}>} ctx the context
 * @returns {import('@aws-appsync/utils').DynamoDBDeleteItemRequest} the request
 */
export function request(ctx) {
    const {integrationId, id} = ctx.args;

    if (util.authType() === 'User Pool Authorization') {
        if (!ctx.identity['groups'].includes(integrationId)) {
            util.unauthorized();
        }
    }

    return {
        operation: 'DeleteItem',
        key: {
            integrationId: util.dynamodb.toDynamoDB(integrationId),
            id: util.dynamodb.toDynamoDB(id),
        },
    };
}

/**
 * Returns the resolver result
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {boolean} true if the delete operation was successful
 */
export function response(ctx) {
    if (ctx.error) {
        util.error(ctx.error.message, ctx.error.type);
    }

    // Check if the delete operation was successful
    // DynamoDB returns the deleted item or undefined if nothing was deleted
    return ctx.result !== null && ctx.result !== undefined;
}
