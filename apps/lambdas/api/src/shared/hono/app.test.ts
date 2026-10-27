import {describe, expect, it} from 'vitest';

import {createHonoApp} from '@/shared/hono/app';
import {BadRequestError} from '@/shared/hono/http-errors';
import {testRequest} from '@/shared/hono/test-request';
import type {AppContext} from '@gitgazer/backend-core/types';

const appContext: AppContext = {userId: 7, username: 'octo', email: 'octo@example.com', name: 'Octo', nickname: 'octo', picture: ''};

describe('createHonoApp', () => {
    it('returns the Powertools 404 body for an unknown route', async () => {
        const res = await testRequest(createHonoApp(), 'GET', '/api/nope');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({statusCode: 404, error: 'NotFoundError', message: 'Route /api/nope for method GET not found'});
    });

    it('strips trailing slashes from the 404 path like Powertools', async () => {
        const res = await testRequest(createHonoApp(), 'POST', '/api/nope/');

        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({message: 'Route /api/nope for method POST not found'});
    });

    it('matches routes with a trailing slash like Powertools', async () => {
        const app = createHonoApp();
        app.get('/api/test', (c) => c.json({ok: true}));

        const res = await testRequest(app, 'GET', '/api/test/');

        expect(res.status).toBe(200);
    });

    it('serializes thrown HttpErrors like Powertools', async () => {
        const app = createHonoApp();
        app.get('/api/test', () => {
            throw new BadRequestError('x', undefined, {a: 1});
        });

        const res = await testRequest(app, 'GET', '/api/test');

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({statusCode: 400, error: 'BadRequestError', message: 'x', details: {a: 1}});
    });

    it('hides unknown errors', async () => {
        const app = createHonoApp();
        app.get('/api/test', () => {
            throw new Error('secret');
        });

        const res = await testRequest(app, 'GET', '/api/test');
        const body = await res.text();

        expect(res.status).toBe(500);
        expect(JSON.parse(body)).toEqual({statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error'});
        expect(body).not.toContain('secret');
    });

    it('exposes the bridged appContext', async () => {
        const app = createHonoApp();
        app.get('/api/test', (c) => c.json({userId: c.var.appContext?.userId}));

        const res = await testRequest(app, 'GET', '/api/test', {appContext});

        expect(await res.json()).toEqual({userId: 7});
    });
});

describe('testRequest', () => {
    it('sends cookies, headers and a JSON body', async () => {
        const app = createHonoApp();
        app.post('/api/test', async (c) =>
            c.json({cookie: c.req.header('cookie'), custom: c.req.header('x-custom'), type: c.req.header('content-type'), body: await c.req.json()}),
        );

        const res = await testRequest(app, 'POST', '/api/test', {cookies: ['a=1', 'b=2'], headers: {'x-custom': 'yes'}, body: {hello: 'world'}});

        expect(await res.json()).toEqual({cookie: 'a=1; b=2', custom: 'yes', type: 'application/json', body: {hello: 'world'}});
    });
});
