import { util } from "@aws-appsync/utils";

/**
 * Puts an item into the DynamoDB table.
 * @param {import('@aws-appsync/utils').Context<{input: any}>} ctx the context
 * @returns {import('@aws-appsync/utils').DynamoDBUpdateItemRequest} the request
 */
export function request(ctx) {
  const { owner, repository_name, workflow_name, enabled } = ctx.args.input;
  const idParts = [
    owner,
    ...(repository_name != null ? [repository_name] : []),
    ...(workflow_name != null ? [workflow_name] : []),
  ];

  const key = { id: idParts.join("/") };
  const now = util.time.nowISO8601();

  return {
    operation: "UpdateItem",
    key: {
      id: util.dynamodb.toDynamoDB(key.id),
    },
    update: {
      expression:
        "SET #created_at = if_not_exists(#created_at, :created_at), #updated_at = :updated_at, #owner = :owner, #repository_name = :repository_name, #workflow_name = :workflow_name, #enabled = :enabled",
      expressionNames: {
        "#created_at": "created_at",
        "#updated_at": "updated_at",
        "#owner": "owner",
        "#repository_name": "repository_name",
        "#workflow_name": "workflow_name",
        "#enabled": "enabled",
      },
      expressionValues: {
        ":created_at": util.dynamodb.toDynamoDB(now),
        ":updated_at": util.dynamodb.toDynamoDB(now),
        ":owner": util.dynamodb.toDynamoDB(owner),
        ":repository_name": util.dynamodb.toDynamoDB(repository_name),
        ":workflow_name": util.dynamodb.toDynamoDB(workflow_name),
        ":enabled": util.dynamodb.toDynamoDB(enabled),
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
  const { error, result } = ctx;
  if (error) {
    return util.appendError(error.message, error.type, result);
  }
  return result;
}
