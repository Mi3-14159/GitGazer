import * as http from 'http';

import {APIGatewayProxyEventV2WithJWTAuthorizer, Context} from 'aws-lambda';

import {handler} from '@/handlers/api';
import {getLogger} from '@/logger';

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

(async (): Promise<void> => {
    const server = http.createServer((req, res) => {
        let body = '';

        req.on('data', (data) => {
            body += data;
        });

        req.on('end', async () => {
            const {headers, method, url} = req;

            const event: APIGatewayProxyEventV2WithJWTAuthorizer = {
                routeKey: '',
                headers: Object.fromEntries(
                    Object.entries(headers || {}).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']),
                ),
                requestContext: {
                    routeKey: '',
                    accountId: 'mocked-account-id',
                    apiId: 'mocked-api-id',
                    stage: 'dev',
                    requestId: 'mocked-request-id',
                    authorizer: {
                        principalId: 'mocked-principal-id',
                        integrationLatency: 0,
                        jwt: {
                            claims: {
                                'cognito:groups': process.env.COGNITO_GROUPS ?? '',
                            },
                            scopes: [],
                        },
                    },
                    domainName: '',
                    domainPrefix: '',
                    http: {
                        method: method || 'GET',
                        path: url?.split('?')[0] ?? '',
                        protocol: '',
                        sourceIp: '',
                        userAgent: '',
                    },
                    time: '',
                    timeEpoch: 0,
                },
                body: ['GET', 'HEAD'].includes(method || '') ? undefined : body,
                isBase64Encoded: false,
                version: '2.0',
                rawPath: url?.split('?')[0] || '',
                rawQueryString: url?.split('?')[1] || '',
            };

            const result = await handler(event, context);
            if (!result) {
                res.statusCode = 500;
                res.end();
                return;
            }

            res.statusCode = result.statusCode ?? 200;
            // Iterate headers and set them on the Node response.
            // Avoid forwarding Content-Length because it may no longer match after decoding base64.
            Object.entries(result.headers ?? {}).forEach(([key, value]) => {
                if (key.toLowerCase() === 'content-length') {
                    return;
                }
                res.setHeader(key, value as unknown as string);
            });

            const responseBody = result.body ?? '';
            if (result.isBase64Encoded) {
                res.end(Buffer.from(responseBody, 'base64'));
                return;
            }

            res.end(responseBody);
        });
    });

    logger.info(`Development server listening on http://localhost:${PORT}`, {
        port: PORT,
    });
    server.listen(PORT);
})();
