import {createBaseApp} from '@/app';
import type {handler} from '@/index';
import type {AppEnv} from '@/shared/hono/env';
import type {AppContext} from '@gitgazer/backend-core/types';
import type {Hono} from 'hono';

export const testRequest = async (
    app: Hono<AppEnv>,
    method: string,
    path: string,
    init: {appContext?: AppContext; cookies?: string[]; headers?: Record<string, string>; body?: string | object; basePath?: string} = {},
): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.cookies) {
        headers.set('cookie', init.cookies.join('; '));
    }

    let body = init.body;
    if (typeof body === 'object') {
        body = JSON.stringify(body);
        if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
        }
    }

    const base = createBaseApp();
    base.use(async (c, next) => {
        c.set('appContext', init.appContext);
        await next();
    });
    // Domain routers are mounted under /api like in createApp; pass basePath '/' for routers served at the root
    return base.route(init.basePath ?? '/api', app).request(path, {method, headers, body});
};

export const apiGatewayEvent = (
    method: string,
    path: string,
    init: {headers?: Record<string, string>; cookies?: string[]; body?: string; isBase64Encoded?: boolean} = {},
): Parameters<typeof handler>[0] => {
    const [rawPath, rawQueryString = ''] = path.split('?');
    return {
        version: '2.0',
        routeKey: '$default',
        rawPath,
        rawQueryString,
        cookies: init.cookies,
        headers: {host: 'api.example.com', ...init.headers},
        requestContext: {
            accountId: '123',
            apiId: 'api',
            domainName: 'api.example.com',
            domainPrefix: 'api',
            http: {method, path: rawPath, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest'},
            requestId: 'req-1',
            routeKey: '$default',
            stage: '$default',
            time: '',
            timeEpoch: 0,
        },
        body: init.body,
        isBase64Encoded: init.isBase64Encoded ?? false,
    };
};
