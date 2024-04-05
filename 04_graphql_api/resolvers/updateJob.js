import { util } from '@aws-appsync/utils';
import { update } from '@aws-appsync/utils/dynamodb';

/**
 * Updates an item in a DynamoDB table, if an item with the given key exists.
 * @param {import('@aws-appsync/utils').Context<{input: any}>} ctx the context
 * @returns {import('@aws-appsync/utils').DynamoDBUpdateItemRequest} the request
 */
export function request(ctx) {
    const { runId, workflowName, ...values } = ctx.args.input;
    const key = { runId, workflowName };
    const condition = {};
    for (const k in key) {
        condition[k] = { attributeExists: true };
    }
    
    return update({
        key,
        update: values,
        condition,
    })
}

/**
 * Returns the updated item or throws an error if the operation failed.
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the result
 */
export function response(ctx) {
    const { error, result } = ctx;
    if (error) {
        return util.appendError(error.message, error.type, result);
    }
    return result;
}
