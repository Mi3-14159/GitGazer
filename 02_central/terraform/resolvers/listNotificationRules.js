import {runtime, util} from '@aws-appsync/utils';
import {scan} from '@aws-appsync/utils/dynamodb';

/**
 * @param {import('@aws-appsync/utils').Context<{nextToken?: string}>} ctx the context
 * @returns {import('@aws-appsync/utils').DynamoDBScanRequest} the request
 */
export function request(ctx) {
    const {nextToken} = ctx.args;
    if (util.authType() === 'User Pool Authorization') {
        const groups = ctx.identity['groups'];

        if (!groups || groups.length === 0) {
            runtime.earlyReturn({items: []});
        }

        const expressionValues = {':placeholder': {S: 'placeholder'}};
        const keys = [];
        for (const i in groups) {
            const group = groups[i];
            const key = `:kv${i}`;
            expressionValues[key] = {S: group};
            keys.push(key);
        }
        delete expressionValues[':placeholder'];
        const expression = `#integrationId IN (${keys.join(',')})`;

        return {
            operation: 'Scan',
            filter: {
                expressionNames: {'#integrationId': 'integrationId'},
                expressionValues,
                expression,
            },
            index: 'integrationId-index',
            nextToken,
        };
    }

    return scan({
        nextToken,
    });
}

/**
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {{items: any[]}} the result
 */
export function response(ctx) {
    const {error, result} = ctx;
    if (error) {
        return util.appendError(error.message, error.type, result);
    }
    const {items = []} = result;
    for (const item of items) {
        item.owner = item.rule.owner;
        item.repository_name = item.rule.repository_name;
        item.workflow_name = item.rule.workflow_name;
        item.head_branch = item.rule.head_branch;
    }
    return {items};
}
