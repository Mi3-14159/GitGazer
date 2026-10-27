import {beforeEach, describe, expect, it, vi} from 'vitest';

import {createHonoApp} from '@/shared/hono/app';
import {testRequest} from '@/shared/hono/test-request';
import {addUserIntegrationsToCtx, addUserIntegrationsToCtxHono} from './integrations.middleware';

// Mock integrations controller
vi.mock('@/domains/integrations/integrations.controller', () => ({
    getUserIntegrationRoles: vi.fn(),
}));

import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';

function makeReqCtx(userId: string) {
    return {
        appContext: {
            userId,
        },
    } as any;
}

describe('extractUserIntegrations middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('successfully fetches user integrations and roles and calls next', async () => {
        const next = vi.fn(async () => undefined);
        vi.mocked(getUserIntegrationRoles).mockResolvedValue({
            integrationA: 'owner',
            integrationB: 'member',
        });

        const reqCtx = makeReqCtx('user123');
        await addUserIntegrationsToCtx({reqCtx, next});

        expect(next).toHaveBeenCalledTimes(1);
        expect(getUserIntegrationRoles).toHaveBeenCalledWith('user123');
        expect(reqCtx.appContext.integrations).toEqual(['integrationA', 'integrationB']);
        expect(reqCtx.appContext.integrationRoles).toEqual({
            integrationA: 'owner',
            integrationB: 'member',
        });
    });

    it('successfully handles empty integrations and calls next', async () => {
        const next = vi.fn(async () => undefined);
        vi.mocked(getUserIntegrationRoles).mockResolvedValue({});

        const reqCtx = makeReqCtx('user123');
        await addUserIntegrationsToCtx({reqCtx, next});

        expect(next).toHaveBeenCalledTimes(1);
        expect(getUserIntegrationRoles).toHaveBeenCalledWith('user123');
        expect(reqCtx.appContext.integrations).toEqual([]);
        expect(reqCtx.appContext.integrationRoles).toEqual({});
    });

    it('throws error when getUserIntegrationRoles throws an error', async () => {
        const next = vi.fn(async () => undefined);
        const error = new Error('RDS connection failed');
        vi.mocked(getUserIntegrationRoles).mockRejectedValue(error);

        await expect(addUserIntegrationsToCtx({reqCtx: makeReqCtx('user123'), next})).rejects.toThrow('RDS connection failed');

        expect(next).not.toHaveBeenCalled();
        expect(getUserIntegrationRoles).toHaveBeenCalledWith('user123');
    });
});

describe('addUserIntegrationsToCtxHono middleware', () => {
    const handler = vi.fn();

    function callRoute() {
        const app = createHonoApp();
        app.get('/api/test', addUserIntegrationsToCtxHono, (c) => {
            handler();
            return c.json({integrations: c.var.appContext?.integrations, integrationRoles: c.var.appContext?.integrationRoles});
        });
        return testRequest(app, 'GET', '/api/test', {
            appContext: {userId: 123, username: '', email: '', name: '', nickname: '', picture: ''},
        });
    }

    it('successfully fetches user integrations and roles and calls next', async () => {
        vi.mocked(getUserIntegrationRoles).mockResolvedValue({
            integrationA: 'owner',
            integrationB: 'member',
        });

        const res = await callRoute();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(getUserIntegrationRoles).toHaveBeenCalledWith(123);
        expect(await res.json()).toEqual({
            integrations: ['integrationA', 'integrationB'],
            integrationRoles: {integrationA: 'owner', integrationB: 'member'},
        });
    });

    it('successfully handles empty integrations and calls next', async () => {
        vi.mocked(getUserIntegrationRoles).mockResolvedValue({});

        const res = await callRoute();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(getUserIntegrationRoles).toHaveBeenCalledWith(123);
        expect(await res.json()).toEqual({integrations: [], integrationRoles: {}});
    });

    it('fails the request when getUserIntegrationRoles throws an error', async () => {
        vi.mocked(getUserIntegrationRoles).mockRejectedValue(new Error('RDS connection failed'));

        const res = await callRoute();

        expect(res.status).toBe(500);
        expect(handler).not.toHaveBeenCalled();
        expect(getUserIntegrationRoles).toHaveBeenCalledWith(123);
    });
});
