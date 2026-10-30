import router from '@/domains/apps/apps.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';
import type {MemberRole} from '@gitgazer/db/types';
import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const app = new Hono<AppEnv>().route('/api/integrations/:integrationId', router);

const mocks = vi.hoisted(() => ({
    role: 'viewer' as string,
    otherRoles: {} as Record<string, string>,
    listApps: vi.fn(),
    installApp: vi.fn(),
    listSlackChannels: vi.fn(),
    createHandle: vi.fn(),
    buildSlackInstallRedirect: vi.fn(),
    listMoveCandidates: vi.fn(),
    moveWebhookHandles: vi.fn(),
}));

vi.mock('@/domains/apps/apps.controller', () => ({
    listApps: mocks.listApps,
    installApp: mocks.installApp,
    uninstallApp: vi.fn(),
    createHandle: mocks.createHandle,
    updateHandle: vi.fn(),
    deleteHandle: vi.fn(),
    listSlackChannels: mocks.listSlackChannels,
}));
vi.mock('@/domains/apps/slack-move', () => ({listMoveCandidates: mocks.listMoveCandidates, moveWebhookHandles: mocks.moveWebhookHandles}));
vi.mock('@/domains/apps/slack-install', () => ({buildSlackInstallRedirect: mocks.buildSlackInstallRedirect}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const call = (method: string, path: string, init: {body?: object} = {}) => {
    const integrationRoles = {i1: mocks.role, ...mocks.otherRoles} as Record<string, MemberRole>;
    const appContext = {
        userId: 1,
        username: '',
        email: '',
        name: '',
        nickname: '',
        picture: '',
        integrations: Object.keys(integrationRoles),
        integrationRoles,
    };
    return testRequest(app, method, path, {appContext, ...init});
};

describe('GET /api/integrations/:integrationId/apps', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.otherRoles = {};
        mocks.listApps.mockResolvedValue([]);
    });

    // The secret and the urls are masked by the views (proven in packages/db configuration-views.test.ts), not here.
    it.each(['viewer', 'member', 'admin', 'owner'])("signs only the route's integration with the caller's role as %s", async (role) => {
        mocks.role = role;
        mocks.otherRoles = {i2: 'owner'};

        const res = await call('GET', '/api/integrations/i1/apps');

        expect(res.status).toBe(200);
        expect(mocks.listApps).toHaveBeenCalledWith({integrationId: 'i1', integrationRoles: {i1: role}});
    });

    it('returns the apps as the controller lists them', async () => {
        mocks.role = 'viewer';
        const apps = [
            {appId: 'a1', type: 'github', createdAt: '2026-01-01T00:00:00.000Z', settings: {secret: null, orgSyncDefaultRole: 'viewer'}},
            {appId: 'a2', type: 'webhook', createdAt: '2026-01-01T00:00:00.000Z', handles: [{handleId: 'h1', url: null}]},
        ];
        mocks.listApps.mockResolvedValue(apps);

        const res = await call('GET', '/api/integrations/i1/apps');

        expect(await res.json()).toEqual(apps);
    });
});

describe('POST /api/integrations/:integrationId/apps', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.otherRoles = {};
        mocks.installApp.mockResolvedValue({appId: 'a2', type: 'webhook'});
    });

    it.each(['admin', 'owner'])("passes the caller's role as %s for reading the new app back", async (role) => {
        mocks.role = role;

        const res = await call('POST', '/api/integrations/i1/apps', {body: {type: 'webhook'}});

        expect(res.status).toBe(201);
        expect(mocks.installApp).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1'], role, type: 'webhook'});
    });
});

describe('Slack routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listSlackChannels.mockResolvedValue([{id: 'C1', name: 'ops', isPrivate: false}]);
        mocks.createHandle.mockResolvedValue({handleId: 'h-1'});
        mocks.buildSlackInstallRedirect.mockReturnValue({location: 'https://slack.com/oauth/v2/authorize?state=s', stateCookie: 'oauthState=n'});
    });

    it.each([
        ['viewer', 403],
        ['member', 403],
        ['admin', 200],
        ['owner', 200],
    ])('channels route is admin only (%s -> %s)', async (role, status) => {
        mocks.role = role;

        const res = await call('GET', '/api/integrations/i1/apps/a1/slack/channels');

        expect(res.status).toBe(status);
        expect(mocks.listSlackChannels).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    });

    it('install redirects admins to Slack with the state cookie', async () => {
        mocks.role = 'admin';

        const res = await call('GET', '/api/integrations/i1/apps/slack/install?redirect_url=https://app.example.com/x');

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('https://slack.com/oauth/v2/authorize?state=s');
        expect(res.headers.getSetCookie().join()).toContain('oauthState=n');
        expect(mocks.buildSlackInstallRedirect).toHaveBeenCalledWith({integrationId: 'i1', userId: 1, redirectUrl: 'https://app.example.com/x'});
    });

    it('install is admin only', async () => {
        mocks.role = 'member';

        const res = await call('GET', '/api/integrations/i1/apps/slack/install');

        expect(res.status).toBe(403);
        expect(mocks.buildSlackInstallRedirect).not.toHaveBeenCalled();
    });

    it('a handle with a channelId is created as a channel handle', async () => {
        mocks.role = 'admin';

        const res = await call('POST', '/api/integrations/i1/apps/a1/handles', {body: {channelId: 'C1'}});

        expect(res.status).toBe(201);
        expect(mocks.createHandle).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1'], appId: 'a1', channelId: 'C1'});
    });

    it('move candidates and move are admin only', async () => {
        mocks.role = 'member';

        const list = await call('GET', '/api/integrations/i1/apps/slack/move-candidates');
        const move = await call('POST', '/api/integrations/i1/apps/slack/move', {body: {moves: []}});

        expect([list.status, move.status]).toEqual([403, 403]);
        expect(mocks.listMoveCandidates).not.toHaveBeenCalled();
        expect(mocks.moveWebhookHandles).not.toHaveBeenCalled();
    });

    it('move passes the picked channels to the controller', async () => {
        mocks.role = 'admin';
        mocks.moveWebhookHandles.mockResolvedValue({moved: ['w1'], failed: [], webhookAppEmpty: true});
        const moves = [{webhookHandleId: 'w1', channelId: 'C1'}];

        const res = await call('POST', '/api/integrations/i1/apps/slack/move', {body: {moves}});

        expect(res.status).toBe(200);
        expect(mocks.moveWebhookHandles).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1'], moves});
    });

    it('move rejects malformed moves', async () => {
        mocks.role = 'admin';

        const res = await call('POST', '/api/integrations/i1/apps/slack/move', {body: {moves: [{webhookHandleId: 'w1'}]}});

        expect(res.status).toBe(400);
        expect(mocks.moveWebhookHandles).not.toHaveBeenCalled();
    });

    it('move candidates are listed for admins', async () => {
        mocks.role = 'admin';
        mocks.listMoveCandidates.mockResolvedValue([{handleId: 'w1', name: 'x', ruleCount: 1}]);

        const res = await call('GET', '/api/integrations/i1/apps/slack/move-candidates');

        expect(res.status).toBe(200);
        expect(mocks.listMoveCandidates).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1']});
    });
});
