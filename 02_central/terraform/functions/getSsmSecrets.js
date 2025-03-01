import {util} from '@aws-appsync/utils';

/**
 * Starts the resolver execution
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the return value sent to the first AppSync function
 */
export function request(ctx) {
    if (util.authType() === 'User Pool Authorization') {
        const groups = ctx.identity['groups'];
        if (!groups || groups.length === 0) {
            runtime.earlyReturn([]);
        }

        const Names = groups.map((group) => `${ssm_parameter_name_prefix}$${group}`);
        return fetch('/', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-amz-json-1.1',
                'x-amz-target': 'AmazonSSM.GetParameters',
            },
            body: {
                Names,
                WithDecryption: true,
            },
        });
    }

    return fetch('/', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-amz-json-1.1',
            'x-amz-target': 'AmazonSSM.GetParametersByPath',
        },
        body: {
            Path: '${ssm_parameter_name_prefix}',
            WithDecryption: true,
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
        const parameters = JSON.parse(ctx.result.body).Parameters;
        return parameters.map((param) => {
            const parts = param.Name.split('/');
            const secretValue = JSON.parse(param.Value);
            return {
                id: parts[parts.length - 1],
                users: [],
                ...secretValue,
            };
        });
    } else {
        return util.appendError(ctx.result.body, 'ctx.result.statusCode');
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
    const {method = 'GET', headers, body: _body, query} = options;
    const body = typeof _body === 'object' ? JSON.stringify(_body) : _body;
    return {
        resourcePath,
        method,
        params: {headers, query, body},
    };
}
