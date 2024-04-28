import { query } from "@aws-appsync/utils/dynamodb";

export function request(ctx) {
  // Update with custom logic or select a code sample.
  console.log("asd: test: request:", JSON.stringify({ ctx }));
  const username = ctx.identity?.["username"];
  if (!username) {
    return runtime.earlyReturn(null);
  }

  const usernameParts = username.split("_");
  return query({
    query: {
      userId: { eq: usernameParts[1] },
    },
    /*filter: {
      repositories: { contains: "Mi3-14159/GitGazer" },
    },*/
  });
}

/**
 * Returns the resolver result
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the result
 */
export function response(ctx) {
  console.log("asd: test: response:", JSON.stringify(ctx));
  const { error, result } = ctx;
  if (error) {
    return util.error(ctx.error.message, ctx.error.type);
  }

  if (!result || !result.items || result.items.length === 0) {
    //return util.unauthorized();
    console.log("asd: test: response: not result:", JSON.stringify(ctx));
    /*const first = {};
  if (ctx.args.workflow_name) {
    first["workflow_name"] = { eq: ctx.args.workflow_name };
  }*/

    console.log("asd: test: response: userpool:", JSON.stringify(result));
    //first['repository.full_name'] = { in : result.repositories }

    const filter = {
      or: [
        {
          run_id: { le: 0 },
        },
      ],
    };

    console.log("subscription filter:", JSON.stringify(filter));
    extensions.setSubscriptionFilter(
      util.transform.toSubscriptionFilter(filter)
    );
  }

  // important: return null in the response
  return null;
}
