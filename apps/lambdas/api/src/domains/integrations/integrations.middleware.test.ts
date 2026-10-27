import {describe, expect, it, vi} from 'vitest';

import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';
import {Hono} from 'hono';
import {addUserIntegrationsToCtx} from './integrations.middleware';

// Mock integrations controller
vi.mock('@/domains/integrations/integrations.controller', () => ({
    getUserIntegrationRoles: vi.fn(),
}));

import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';

describe('addUserIntegrationsToCtx middleware', () => {
    const handler = vi.fn();

    function callRoute() {
        const app = new Hono<AppEnv>();
        app.get('/api/test', addUserIntegrationsToCtx, (c) => {
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
