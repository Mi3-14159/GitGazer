import { util } from "@aws-appsync/utils";
import { put } from "@aws-appsync/utils/dynamodb";

/**
 * Puts an item into the DynamoDB table.
 * @param {import('@aws-appsync/utils').Context<{input: any}>} ctx the context
 * @returns {import('@aws-appsync/utils').DynamoDBPutItemRequest} the request
 */
export function request(ctx) {
  const { owner, repository_name, workflow_name } = ctx.args.input;
  const idParts = [
    owner,
    ...(repository_name != null ? [repository_name] : []),
    ...(workflow_name != null ? [workflow_name] : []),
  ];

  const key = { id: idParts.join("/") };

  const condition = { and: [] };
  for (const k in key) {
    condition.and.push({ [k]: { attributeExists: false } });
  }

  const item = {
    ...ctx.args.input,
    createdAt: util.time.nowISO8601(),
    updatedAt: util.time.nowISO8601(),
    version: 2,
  };

  return put({
    key,
    item,
    //condition, // TODO: https://github.com/users/Mi3-14159/projects/1/views/1?pane=issue&itemId=58937221
  });
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
