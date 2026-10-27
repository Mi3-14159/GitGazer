import type {APIGatewayProxyEventV2, Context} from 'aws-lambda';
import {describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
    returning: vi.fn(async () => [{id: 7}]),
}));

vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => ['https://app.example.com'])}, loadConfig: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({
    db: {insert: () => ({values: () => ({onConflictDoUpdate: () => ({returning: mocks.returning})})})},
    withRlsTransaction: vi.fn(),
}));
vi.mock('@/shared/middleware/token-verifier', () => ({
    getVerifiers: () => ({
        accessTokenVerifier: {verify: async () => ({sub: 'sub-1', username: 'octo'})},
        idTokenVerifier: {verify: async () => ({sub: 'sub-1', email: 'octo@example.com', nickname: 'octo'})},
    }),
}));
vi.mock('@/shared/hono/app', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/shared/hono/app')>();
    return {
        createHonoApp: () => {
            const app = original.createHonoApp();
            app.get('/api/hono-only', (c) => c.json({userId: c.var.appContext?.userId, cookie: c.req.header('cookie')}));
            return app;
        },
    };
});

import {createApp} from '@/shared/router';
import {NotFoundError} from '@aws-lambda-powertools/event-handler/http';

const event = (path: string, cookies?: string[]): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    cookies,
    headers: {host: 'api.example.com'},
    requestContext: {
        accountId: '123',
        apiId: 'api',
        domainName: 'api.example.com',
        domainPrefix: 'api',
        http: {method: 'GET', path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest'},
        requestId: 'req-1',
        routeKey: '$default',
        stage: '$default',
        time: '',
        timeEpoch: 0,
    },
    isBase64Encoded: false,
});

const authCookies = ['accessToken=access', 'idToken=id'];

describe('createApp hono bridge', () => {
    it('serves a route only the hono app has, with the appContext from authenticate', async () => {
        const res = await createApp().resolve(event('/api/hono-only', authCookies), {} as Context);

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body!)).toEqual({userId: 7, cookie: 'accessToken=access; idToken=id'});
    });

    it('runs authenticate before bridged routes', async () => {
        const res = await createApp().resolve(event('/api/hono-only'), {} as Context);

        expect(res.statusCode).toBe(401);
    });

    it('returns the Powertools 404 body for a route neither app has', async () => {
        const res = await createApp().resolve(event('/api/nope', authCookies), {} as Context);

        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body!)).toEqual({statusCode: 404, error: 'NotFoundError', message: 'Route /api/nope for method GET not found'});
    });

    it('keeps a NotFoundError thrown by a powertools route', async () => {
        const app = createApp();
        app.get('/api/powertools-only', () => {
            throw new NotFoundError('App not found');
        });

        const res = await app.resolve(event('/api/powertools-only', authCookies), {} as Context);

        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body!)).toEqual({statusCode: 404, error: 'NotFoundError', message: 'App not found'});
    });
});
