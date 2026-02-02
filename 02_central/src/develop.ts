import * as http from 'http';

import {handler} from '@/handlers/api';
import {getLogger} from '@/logger';
import {APIGatewayProxyEventV2, Context} from 'aws-lambda';

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

            // Build cookies array from Cookie header if present
            const cookies: string[] = [];
            if (headers.cookie) {
                cookies.push(Array.isArray(headers.cookie) ? headers.cookie.join('; ') : headers.cookie);
            }

            const event: APIGatewayProxyEventV2 = {
                routeKey: `${method} ${url?.split('?')[0] ?? '/'}`,
                headers: Object.fromEntries(
                    Object.entries(headers || {}).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']),
                ),
                cookies,
                requestContext: {
                    routeKey: `${method} ${url?.split('?')[0] ?? '/'}`,
                    accountId: 'mocked-account-id',
                    apiId: 'mocked-api-id',
                    stage: 'dev',
                    requestId: 'mocked-request-id',
                    domainName: 'localhost',
                    domainPrefix: 'localhost',
                    http: {
                        method: method || 'GET',
                        path: url?.split('?')[0] ?? '/',
                        protocol: 'HTTP/1.1',
                        sourceIp: '127.0.0.1',
                        userAgent: headers['user-agent'] || 'dev-server',
                    },
                    time: new Date().toISOString(),
                    timeEpoch: Date.now(),
                },
                body: ['GET', 'HEAD'].includes(method || '') ? undefined : body,
                isBase64Encoded: false,
                version: '2.0',
                rawPath: url?.split('?')[0] || '/',
                rawQueryString: url?.split('?')[1] || '',
                queryStringParameters: url?.includes('?') ? Object.fromEntries(new URLSearchParams(url.split('?')[1]).entries()) : undefined,
            };

            const result = await handler(event, context);
            if (!result) {
                res.statusCode = 500;
                res.end();
                return;
            }

            res.statusCode = result.statusCode ?? 200;

            // Set response headers
            if (result.headers) {
                Object.entries(result.headers).forEach(([key, value]) => {
                    if (key.toLowerCase() === 'content-length') {
                        return;
                    }
                    res.setHeader(key, value as string);
                });
            }

            // Set cookies if present
            if (result.cookies && result.cookies.length > 0) {
                res.setHeader('Set-Cookie', result.cookies);
            }

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
