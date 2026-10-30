// Template: apps/lambdas/api/src/domains/<domain>/<domain>.routes.test.ts
// testRequest puts the app's error and not-found handlers around the router and sets the given appContext; mount the router where createApiRouter() does.
// Mock the controller. Role checks live in the authorize middleware, which createApp mounts; test them through table.test.ts and authorization.test.ts, not here.

import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import router from '@/domains/things/things.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';

const app = new Hono<AppEnv>().route('/api/integrations/:integrationId/things', router);

const INTEGRATION_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({getThings: vi.fn(), createThing: vi.fn()}));

vi.mock('@/domains/things/things.controller', () => mocks);

const appContext = {userId: 1, username: '', email: '', name: '', nickname: '', picture: ''};

describe('things routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET /api/integrations/:integrationId/things lists the things of the integration', async () => {
        mocks.getThings.mockResolvedValue([{id: 1}]);

        const res = await testRequest(app, 'GET', `/api/integrations/${INTEGRATION_ID}/things`, {appContext});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([{id: 1}]);
        expect(mocks.getThings).toHaveBeenCalledWith({integrationIds: [INTEGRATION_ID]});
    });

    it('POST /api/integrations/:integrationId/things rejects an invalid label', async () => {
        const res = await testRequest(app, 'POST', `/api/integrations/${INTEGRATION_ID}/things`, {appContext, body: {label: 1}});

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({statusCode: 400, error: 'BadRequestError', message: 'Invalid label'});
    });
});
