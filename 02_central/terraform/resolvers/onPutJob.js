import { util, extensions } from "@aws-appsync/utils";

/**
 * Sends an empty payload as the subscription is established
 * @param {*} ctx the context
 * @returns {import('@aws-appsync/utils').NONERequest} the request
 */
export function request(ctx) {
  return { payload: {} };
}

/**
 * Creates an enhanced subscription
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the result
 */
export function response(ctx) {
  const userGroups = ctx.identity["groups"];
  const userGroupsChunks = [];
  const chunkSize = 5;

  let chunk = [];
  let i = 0;
  for (const group of userGroups) {
    if (i % chunkSize === 0 && i > 0) {
      userGroupsChunks.push({ integrationId: { in: chunk } });
      chunk = [];
    }
    chunk.push(group);
    i = i + 1;
  }

  if (chunk.length > 0) {
    userGroupsChunks.push({ integrationId: { in: chunk } });
  }

  const filter = util.transform.toSubscriptionFilter({
    or: userGroupsChunks,
  });

  if (userGroups.indexOf("admin") === -1) {
    extensions.setSubscriptionFilter(filter);
  }
  return null;
}
