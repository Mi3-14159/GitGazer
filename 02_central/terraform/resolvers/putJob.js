import { util } from '@aws-appsync/utils';
import { put } from '@aws-appsync/utils/dynamodb';

/**
 * Puts an item into the DynamoDB table.
 * @param {import('@aws-appsync/utils').Context<{input: any}>} ctx the context
 * @returns {import('@aws-appsync/utils').DynamoDBPutItemRequest} the request
 */
export function request(ctx) {
    const { job_id } = ctx.args.input;
    const key = { job_id };
    const condition = { and: [] };
    for (const k in key) {
        condition.and.push({ [k]: { attributeExists: false } });
    }
    
    return put({
        key,
        item: ctx.args.input,
        //condition, // TODO: https://github.com/users/Mi3-14159/projects/1/views/1?pane=issue&itemId=58937221
    })
}

/**
 * Returns the item or throws an error if the operation failed.
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
