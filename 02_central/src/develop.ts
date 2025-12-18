import * as http from 'http';

import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2, Context} from 'aws-lambda';

import {handler} from '@/handlers/api';
import {getLogger} from '@/logger';
import router from '@/router';

const logger = getLogger();
const PORT = 8080;
const context: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'dev-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:local:0:function:dev-function',
    memoryLimitInMB: '128',
    awsRequestId: 'dev-request-id',
    logGroupName: '/aws/lambda/dev-function',
    logStreamName: '2024/01/01/[$LATEST]dev-log-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
};

/**
 * Extract path parameters from the actual path using the route pattern
 */
function extractPathParameters(routePattern: string, actualPath: string): Record<string, string> {
    const pathParams: Record<string, string> = {};

    // Extract the route path from the pattern (remove method prefix)
    const routePath = routePattern.split(' ', 2)[1];
    if (!routePath) {
        return pathParams;
    }

    // Convert route pattern to regex with named groups
    const paramNames: string[] = [];
    const pattern = routePath.replace(/\{([^}]+)\}/g, (_, paramName) => {
        paramNames.push(paramName);
        return '([^/]+)';
    });

    const regex = new RegExp(`^${pattern}$`);
    const matches = actualPath.match(regex);

    if (matches && matches.length > 1) {
        paramNames.forEach((paramName, index) => {
            pathParams[paramName] = matches[index + 1];
        });
    }

    return pathParams;
}

function findMatchingRoute(method: string, path: string): string | null {
    const routeKeys = router.getRoutes();
    // Try exact match first
    const exactMatch = `${method} ${path}`;
    if (routeKeys.includes(exactMatch)) {
        return path;
    }

    // Try pattern matching for parameterized routes
    const routes = Array.from(routeKeys);
    for (const route of routes) {
        const [routeMethod, routePath] = route.split(' ', 2);
        if (routeMethod !== method) continue;

        // Convert route pattern to regex
        const pattern = routePath.replace(/\{[^}]+\}/g, '([^/]+)');
        const regex = new RegExp(`^${pattern}$`);

        if (regex.test(path)) {
            return route;
        }
    }

    return null;
}

(async (): Promise<void> => {
    const server = http.createServer((req, res) => {
        let body = '';

        req.on('data', (data) => {
            body += data;
        });

        req.on('end', async () => {
            const {headers, method, url} = req;

            const path = url?.split('?')[0] ?? '';
            const httpMethod = method || 'GET';

            // Find the matching route to determine the correct resource pattern
            const matchingRoute = findMatchingRoute(httpMethod, path);
            const routeKey = `${httpMethod} ${matchingRoute || path}`;

            // Extract path parameters based on the route pattern
            const pathParameters = matchingRoute ? extractPathParameters(matchingRoute, path) : {};

            const query = url?.split('?')[1] ?? '';
            const queryStringParameters: {[key: string]: string} = {};
            query?.split('&').forEach((cur) => {
                const [key, value] = cur.split('=');
                if (key) {
                    queryStringParameters[decodeURIComponent(key)] = decodeURIComponent(value || '');
                }
            });

            const event: APIGatewayProxyEventV2WithJWTAuthorizer = {
                routeKey,
                headers: Object.fromEntries(
                    Object.entries(headers || {}).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']),
                ),
                queryStringParameters,
                pathParameters,
                requestContext: {
                    routeKey, // Use the same as resource for consistency
                    accountId: 'mocked-account-id',
                    apiId: 'mocked-api-id',
                    stage: 'dev',
                    requestId: 'mocked-request-id',
                    authorizer: {
                        principalId: 'mocked-principal-id',
                        integrationLatency: 0,
                        jwt: {
                            claims: {},
                            scopes: [],
                        },
                    },
                    domainName: '',
                    domainPrefix: '',
                    http: {
                        method: httpMethod,
                        path: '',
                        protocol: '',
                        sourceIp: '',
                        userAgent: '',
                    },
                    time: '',
                    timeEpoch: 0,
                },
                body: body,
                isBase64Encoded: false,
                version: '',
                rawPath: '',
                rawQueryString: '',
            };

            const result = (await handler(event, context)) as APIGatewayProxyStructuredResultV2;
            if (!result) {
                res.statusCode = 500;
                res.end();
                return;
            }

            res.statusCode = result.statusCode ?? 200;
            // iterate headers and set them on the res.header object
            Object.entries(result.headers ?? {}).forEach(([key, value]) => {
                res.setHeader(key, value as unknown as string);
            });

            res.end(result.body);
        });
    });

    logger.info(`Development server listening on http://localhost:${PORT}`, {
        port: PORT,
    });
    server.listen(PORT);
})();
