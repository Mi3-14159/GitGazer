// Template: apps/lambdas/api/src/domains/<domain>/<domain>.routes.test.ts
// testRequest mounts the router behind the app's error and not-found handlers and sets the given appContext.
// Mock the controller and addUserIntegrationsToCtx; requireRole runs for real against integrationRoles.

import {beforeEach, describe, expect, it, vi} from 'vitest';

import router from '@/domains/things/things.routes';
import {testRequest} from '@/shared/hono/test-request';

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

        const res = await testRequest(router, 'GET', '/api/things', {appContext});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([{id: 1}]);
        expect(mocks.getThings).toHaveBeenCalledWith({integrationIds: [INTEGRATION_ID]});
    });

    it('POST /api/integrations/:integrationId/things rejects an invalid label', async () => {
        const res = await testRequest(router, 'POST', `/api/integrations/${INTEGRATION_ID}/things`, {appContext, body: {label: 1}});

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({statusCode: 400, error: 'BadRequestError', message: 'Invalid label'});
    });
});
