import { util } from "@aws-appsync/utils";

/**
 * Starts the resolver execution
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the return value sent to the first AppSync function
 */
export function request(ctx) {
  const { input = {} } = ctx.arguments;
  const { id, secret } = input;

  const prefix = "${ssm_parameter_name_prefix}";
  const Name = `$${prefix}$${id ?? util.autoId()}`;
  const Value = secret ?? util.autoId();

  ctx.stash.parameter = {
    id: Name,
    secret: Value,
    integrationId: id ?? util.autoId(),
  };

  if (util.authType() === "User Pool Authorization") {
    ctx.stash.parameter.username = ctx.identity["username"];
    if (id && !ctx.identity["groups"].includes(id)) {
      util.unauthorized();
    }
  }

  return fetch("/", {
    method: "POST",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": "AmazonSSM.PutParameter",
    },
    body: {
      Name,
      Value,
      Overwrite: true,
      KeyId: "${kms_key_id}",
      Type: "SecureString",
    },
  });
}

/**
 * Returns the resolver result
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the return value of the last AppSync function response handler
 */
export function response(ctx) {
  if (ctx.error) {
    return util.error(ctx.error.message, ctx.error.type);
  }
  if (ctx.result.statusCode == 200) {
    return;
  } else {
    return util.appendError(ctx.result.body, "ctx.result.statusCode");
  }
}

/**
 * Sends an HTTP request
 * @param {string} resourcePath path of the request
 * @param {Object} [options] values to publish
 * @param {'PUT' | 'POST' | 'GET' | 'DELETE' | 'PATCH'} [options.method] the request method
 * @param {Object.<string, string>} [options.headers] the request headers
 * @param {string | Object.<string, any>} [options.body] the request body
 * @param {Object.<string, string>} [options.query] Key-value pairs that specify the query string
 * @returns {import('@aws-appsync/utils').HTTPRequest} the request
 */
function fetch(resourcePath, options) {
  const { method = "GET", headers, body: _body, query } = options;
  const body = typeof _body === "object" ? JSON.stringify(_body) : _body;
  return {
    resourcePath,
    method,
    params: { headers, query, body },
  };
}
