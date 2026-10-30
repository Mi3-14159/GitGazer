import {Hono} from 'hono';
import {gunzipSync} from 'zlib';
import {describe, expect, it, vi} from 'vitest';

import type {AppEnv} from '@/shared/hono/env';

const mocks = vi.hoisted(() => ({
    returning: vi.fn(async () => [{id: 7}]),
    bigPayload: {items: Array.from({length: 200}, (_, i) => `item-${i}`)},
}));

vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => ['https://app.example.com'])}, loadConfig: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({
    db: {insert: () => ({values: () => ({onConflictDoUpdate: () => ({returning: mocks.returning})})})},
    initDb: vi.fn(),
    withRlsTransaction: vi.fn(),
}));
vi.mock('@/shared/middleware/token-verifier', () => ({
    getVerifiers: () => ({
        accessTokenVerifier: {verify: async () => ({sub: 'sub-1', username: 'octo'})},
        idTokenVerifier: {verify: async () => ({sub: 'sub-1', email: 'octo@example.com', nickname: 'octo'})},
    }),
}));
vi.mock('@/shared/middleware/authorization', () => ({authorize: async (_c: unknown, next: () => Promise<void>) => next()}));
vi.mock('@/domains/users/users.routes', async () => {
    const {Hono} = await import('hono');
    return {default: new Hono().get('/big', (c) => c.json(mocks.bigPayload))};
});

import {createApp} from '@/app';
import {BadRequestError, NotFoundError} from '@/shared/errors';
import {testRequest} from '@/shared/hono/test-request';
import {getLogger} from '@gitgazer/backend-core/logger';
import type {AppContext} from '@gitgazer/backend-core/types';

const authCookie = 'accessToken=access; idToken=id';
const allowedOrigin = 'https://app.example.com';

const send = (app: Hono<AppEnv>, method: string, path: string, headers: Record<string, string> = {}) =>
    app.request(path, {method, headers: {cookie: authCookie, ...headers}});

describe('createApp', () => {
    it('returns a JSON 404 body for an unknown route', async () => {
        const res = await send(createApp(), 'GET', '/api/nope');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({statusCode: 404, error: 'NotFoundError', message: 'Route /api/nope for method GET not found'});
    });

    it('matches routes with a trailing slash', async () => {
        const app = createApp();
        app.get('/api/test', (c) => c.json({ok: true}));

        const res = await send(app, 'GET', '/api/test/');

        expect(res.status).toBe(200);
    });

    it('serializes thrown HttpErrors', async () => {
        const app = createApp();
        app.get('/api/test', () => {
            throw new BadRequestError('x', {a: 1});
        });

        const res = await send(app, 'GET', '/api/test');

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({statusCode: 400, error: 'BadRequestError', message: 'x', details: {a: 1}});
    });

    it('keeps the message of a NotFoundError thrown by a route', async () => {
        const app = createApp();
        app.get('/api/test', () => {
            throw new NotFoundError('App not found');
        });

        const res = await send(app, 'GET', '/api/test');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({statusCode: 404, error: 'NotFoundError', message: 'App not found'});
    });

    it('hides unknown errors', async () => {
        const logger = {debug: vi.fn(), info: vi.fn(), error: vi.fn()};
        vi.mocked(getLogger).mockReturnValue(logger as never);
        const app = createApp();
        app.get('/api/test', () => {
            throw new Error('secret');
        });

        const res = await send(app, 'GET', '/api/test');
        const body = await res.text();

        expect(logger.error).toHaveBeenCalledWith('Unhandled error processing the request', expect.objectContaining({message: 'secret'}));
        vi.mocked(getLogger).mockReset();
        expect(res.status).toBe(500);
        expect(JSON.parse(body)).toEqual({statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error'});
        expect(body).not.toContain('secret');
    });

    it('exposes the appContext from authenticate', async () => {
        const app = createApp();
        app.get('/api/test', (c) => c.json({userId: c.var.appContext?.userId, email: c.var.appContext?.email}));

        const res = await send(app, 'GET', '/api/test');

        expect(await res.json()).toEqual({userId: 7, email: 'octo@example.com'});
    });

    it('runs authenticate before routes and unknown paths', async () => {
        const app = createApp();
        app.get('/api/test', (c) => c.json({ok: true}));

        const route = await app.request('/api/test');
        const unknown = await app.request('/api/nope');

        expect(route.status).toBe(401);
        expect(await route.json()).toEqual({statusCode: 401, error: 'UnauthorizedError', message: 'Missing authentication tokens'});
        expect(unknown.status).toBe(401);
    });

    it('skips auth on public prefixes', async () => {
        const app = createApp();

        const subtree = await app.request('/api/github/nope');
        const exact = await app.request('/api/mcp', {method: 'GET'});
        const segment = await app.request('/api/mcp/nope');
        const lookalike = await app.request('/api/mcpx');
        const prefixOnly = await app.request('/api/auth/refreshx', {method: 'POST'});

        expect(subtree.status).toBe(404);
        expect(exact.status).toBe(404);
        expect(segment.status).toBe(404);
        expect(lookalike.status).toBe(401);
        expect(prefixOnly.status).toBe(401);
        expect(mocks.returning).not.toHaveBeenCalled();
    });

    it('rejects state-changing requests from foreign origins', async () => {
        const app = createApp();
        app.post('/api/test', (c) => c.json({ok: true}));
        app.get('/api/test', (c) => c.json({ok: true}));

        const foreign = await send(app, 'POST', '/api/test', {origin: 'https://evil.example.com'});
        const allowed = await send(app, 'POST', '/api/test', {origin: allowedOrigin});
        const noOrigin = await send(app, 'POST', '/api/test');
        const safeMethod = await send(app, 'GET', '/api/test', {origin: 'https://evil.example.com'});
        const publicRoute = await app.request('/api/github/nope', {method: 'POST', headers: {origin: 'https://evil.example.com'}});

        expect(foreign.status).toBe(403);
        expect(await foreign.json()).toEqual({statusCode: 403, error: 'ForbiddenError', message: 'Origin not allowed'});
        expect(allowed.status).toBe(200);
        expect(noOrigin.status).toBe(200);
        expect(safeMethod.status).toBe(200);
        expect(publicRoute.status).toBe(404);
    });

    it('answers CORS preflight for allowed origins only', async () => {
        const app = createApp();
        app.get('/api/test', (c) => c.json({ok: true}));
        const preflight = (origin: string) =>
            app.request('/api/integrations', {method: 'OPTIONS', headers: {origin, 'access-control-request-method': 'POST'}});

        const res = await preflight(allowedOrigin);
        const denied = await preflight('https://evil.example.com');
        const simple = await send(app, 'GET', '/api/test', {origin: allowedOrigin});
        const unauthorized = await app.request('/api/test', {headers: {origin: allowedOrigin}});

        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
        expect(denied.headers.has('access-control-allow-origin')).toBe(false);
        expect(simple.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
        expect(unauthorized.status).toBe(401);
        expect(unauthorized.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
    });

    it('gzips responses when the client accepts it', async () => {
        const app = createApp();

        const encoded = await send(app, 'GET', '/api/big', {'accept-encoding': 'gzip'});
        const plain = await send(app, 'GET', '/api/big');

        expect(encoded.status).toBe(200);
        expect(encoded.headers.get('content-encoding')).toBe('gzip');
        expect(JSON.parse(gunzipSync(Buffer.from(await encoded.arrayBuffer())).toString('utf-8'))).toEqual(mocks.bigPayload);
        expect(plain.headers.get('content-encoding')).toBeNull();
        expect(await plain.json()).toEqual(mocks.bigPayload);
    });
});

const appContext: AppContext = {userId: 7, username: 'octo', email: 'octo@example.com', name: 'Octo', nickname: 'octo', picture: ''};

describe('testRequest', () => {
    it('sends cookies, headers and a JSON body', async () => {
        const app = new Hono<AppEnv>();
        app.post('/test', async (c) =>
            c.json({cookie: c.req.header('cookie'), custom: c.req.header('x-custom'), type: c.req.header('content-type'), body: await c.req.json()}),
        );

        const res = await testRequest(new Hono<AppEnv>().route('/api', app), 'POST', '/api/test', {
            cookies: ['a=1', 'b=2'],
            headers: {'x-custom': 'yes'},
            body: {hello: 'world'},
        });

        expect(await res.json()).toEqual({cookie: 'a=1; b=2', custom: 'yes', type: 'application/json', body: {hello: 'world'}});
    });

    it('gives a bare domain router the appContext and JSON error bodies', async () => {
        const router = new Hono<AppEnv>();
        router.get('/test', (c) => c.json({userId: c.var.appContext?.userId}));
        router.get('/fail', () => {
            throw new BadRequestError('x');
        });

        const app = new Hono<AppEnv>().route('/api', router);

        const ok = await testRequest(app, 'GET', '/api/test', {appContext});
        const failed = await testRequest(app, 'GET', '/api/fail');
        const unknown = await testRequest(app, 'GET', '/api/nope');

        expect(await ok.json()).toEqual({userId: 7});
        expect(failed.status).toBe(400);
        expect(await failed.json()).toEqual({statusCode: 400, error: 'BadRequestError', message: 'x'});
        expect(await unknown.json()).toEqual({statusCode: 404, error: 'NotFoundError', message: 'Route /api/nope for method GET not found'});
    });
});
