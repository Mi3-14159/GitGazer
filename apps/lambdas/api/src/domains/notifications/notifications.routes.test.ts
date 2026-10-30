import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import router from '@/domains/notifications/notifications.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';

const app = new Hono<AppEnv>().route('/api', router);

const mocks = vi.hoisted(() => ({getNotificationRules: vi.fn(), upsertNotificationRule: vi.fn(), deleteNotificationRule: vi.fn()}));

vi.mock('@/domains/notifications/notifications.controller', () => mocks);

const appContext = {
    userId: 1,
    username: '',
    email: '',
    name: '',
    nickname: '',
    picture: '',
    integrations: ['int-1'],
    integrationRoles: {'int-1': 'member'} as const,
};
const rule = {
    label: 'CI',
    enabled: true,
    ignore_dependabot: false,
    handleIds: [],
    rule: {owner: 'o', repository_name: 'r', workflow_name: 'w', head_branch: 'b', topics: []},
};

describe('notifications routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET /api/notifications lists the rules of the user integrations', async () => {
        mocks.getNotificationRules.mockResolvedValue([{id: 'r1'}]);

        const res = await testRequest(app, 'GET', '/api/notifications', {appContext});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([{id: 'r1'}]);
        expect(mocks.getNotificationRules).toHaveBeenCalledWith({integrationIds: ['int-1']});
    });

    it('POST creates a rule for the integration', async () => {
        mocks.upsertNotificationRule.mockResolvedValue({id: 'r1'});

        const res = await testRequest(app, 'POST', '/api/integrations/int-1/notifications', {appContext, body: rule});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({id: 'r1'});
        expect(mocks.upsertNotificationRule).toHaveBeenCalledWith({rule, integrationId: 'int-1', createOnly: true});
    });

    it('POST rejects a missing body, a malformed body and an invalid rule', async () => {
        const missing = await testRequest(app, 'POST', '/api/integrations/int-1/notifications', {appContext});
        const malformed = await testRequest(app, 'POST', '/api/integrations/int-1/notifications', {appContext, body: '{nope'});
        const invalid = await testRequest(app, 'POST', '/api/integrations/int-1/notifications', {appContext, body: {label: 1}});

        expect(missing.status).toBe(400);
        expect((await missing.json()).message).toBe('Missing request body');
        expect(malformed.status).toBe(400);
        expect((await malformed.json()).message).toBe('Invalid request body');
        expect(invalid.status).toBe(400);
        expect((await invalid.json()).message).toBe('Invalid notification rule');
        expect(mocks.upsertNotificationRule).not.toHaveBeenCalled();
    });

    it('POST is forbidden for a viewer', async () => {
        const res = await testRequest(app, 'POST', '/api/integrations/other/notifications', {appContext, body: rule});

        expect(res.status).toBe(403);
    });

    it('PUT updates the rule', async () => {
        mocks.upsertNotificationRule.mockResolvedValue({id: 'r1'});

        const res = await testRequest(app, 'PUT', '/api/integrations/int-1/notifications/r1', {appContext, body: rule});

        expect(res.status).toBe(200);
        expect(mocks.upsertNotificationRule).toHaveBeenCalledWith({rule, integrationId: 'int-1', ruleId: 'r1'});
    });

    it('PUT rejects an invalid rule update', async () => {
        const res = await testRequest(app, 'PUT', '/api/integrations/int-1/notifications/r1', {appContext, body: {label: 1}});

        expect(res.status).toBe(400);
        expect((await res.json()).message).toBe('Invalid notification rule update');
    });

    it('DELETE removes the rule and returns success', async () => {
        mocks.deleteNotificationRule.mockResolvedValue(undefined);

        const res = await testRequest(app, 'DELETE', '/api/integrations/int-1/notifications/r1', {appContext});

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('application/json');
        expect(await res.json()).toEqual({success: true});
        expect(mocks.deleteNotificationRule).toHaveBeenCalledWith('r1', 'int-1');
    });
});
