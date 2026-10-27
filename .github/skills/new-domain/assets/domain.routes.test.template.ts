// Template: apps/lambdas/api/src/domains/<domain>/<domain>.routes.test.ts
// testRequest puts the app's error and not-found handlers around the router and sets the given appContext; mount the router where createApiRouter() does.
// Mock the controller and addUserIntegrationsToCtx; requireRole runs for real against integrationRoles.

import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import router from '@/domains/things/things.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';

const app = new Hono<AppEnv>().route('/api/things', router);

const INTEGRATION_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({getThings: vi.fn(), createThing: vi.fn()}));

vi.mock('@/domains/things/things.controller', () => mocks);
vi.mock('@/domains/integrations/integrations.middleware', () => ({
    addUserIntegrationsToCtx: async (
        c: {var: {appContext?: {integrations?: string[]; integrationRoles?: Record<string, string>}}},
        next: () => Promise<void>,
    ) => {
        c.var.appContext!.integrations = [INTEGRATION_ID];
        c.var.appContext!.integrationRoles = {[INTEGRATION_ID]: 'admin'};
        await next();
    },
}));

const appContext = {userId: 1, username: '', email: '', name: '', nickname: '', picture: ''};

describe('things routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET /api/things lists the things of the user integrations', async () => {
        mocks.getThings.mockResolvedValue([{id: 1}]);

        const res = await testRequest(app, 'GET', '/api/things', {appContext});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([{id: 1}]);
        expect(mocks.getThings).toHaveBeenCalledWith({integrationIds: [INTEGRATION_ID]});
    });

    it('POST /api/things/:integrationId rejects an invalid label', async () => {
        const res = await testRequest(app, 'POST', `/api/things/${INTEGRATION_ID}`, {appContext, body: {label: 1}});

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({statusCode: 400, error: 'BadRequestError', message: 'Invalid label'});
    });
});
