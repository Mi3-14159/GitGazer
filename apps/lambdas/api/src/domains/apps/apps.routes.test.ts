import router from '@/domains/apps/apps.routes';
import {testRequest} from '@/shared/hono/test-request';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
    role: 'viewer' as string,
    listApps: vi.fn(),
    listSlackChannels: vi.fn(),
    createHandle: vi.fn(),
    buildSlackInstallRedirect: vi.fn(),
    listMoveCandidates: vi.fn(),
    moveWebhookHandles: vi.fn(),
}));

vi.mock('@/domains/apps/apps.controller', () => ({
    listApps: mocks.listApps,
    installApp: vi.fn(),
    uninstallApp: vi.fn(),
    createHandle: mocks.createHandle,
    updateHandle: vi.fn(),
    deleteHandle: vi.fn(),
    listSlackChannels: mocks.listSlackChannels,
}));
vi.mock('@/domains/apps/slack-move', () => ({listMoveCandidates: mocks.listMoveCandidates, moveWebhookHandles: mocks.moveWebhookHandles}));
vi.mock('@/domains/apps/slack-install', () => ({buildSlackInstallRedirect: mocks.buildSlackInstallRedirect}));
vi.mock('@/domains/integrations/integrations.middleware', () => ({
    addUserIntegrationsToCtx: async (c: {set: (key: string, value: unknown) => void}, next: () => Promise<void>) => {
        c.set('appContext', {userId: 1, integrations: ['i1'], integrationRoles: {i1: mocks.role}});
        await next();
    },
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

describe('GET /api/integrations/:integrationId/apps', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listApps.mockResolvedValue([]);
    });

    it.each([
        ['viewer', false],
        ['member', false],
        ['admin', true],
        ['owner', true],
    ])('passes canSeeSecrets for %s as %s', async (role, canSeeSecrets) => {
        mocks.role = role;

        const res = await testRequest(router, 'GET', '/api/integrations/i1/apps');

        expect(res.status).toBe(200);
        expect(mocks.listApps).toHaveBeenCalledWith(expect.objectContaining({integrationId: 'i1', canSeeSecrets}));
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

        const res = await testRequest(router, 'GET', '/api/integrations/i1/apps/a1/slack/channels');

        expect(res.status).toBe(status);
        expect(mocks.listSlackChannels).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    });

    it('install redirects admins to Slack with the state cookie', async () => {
        mocks.role = 'admin';

        const res = await testRequest(router, 'GET', '/api/integrations/i1/apps/slack/install?redirect_url=https://app.example.com/x');

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('https://slack.com/oauth/v2/authorize?state=s');
        expect(res.headers.getSetCookie().join()).toContain('oauthState=n');
        expect(mocks.buildSlackInstallRedirect).toHaveBeenCalledWith({integrationId: 'i1', userId: 1, redirectUrl: 'https://app.example.com/x'});
    });

    it('install is admin only', async () => {
        mocks.role = 'member';

        const res = await testRequest(router, 'GET', '/api/integrations/i1/apps/slack/install');

        expect(res.status).toBe(403);
        expect(mocks.buildSlackInstallRedirect).not.toHaveBeenCalled();
    });

    it('a handle with a channelId is created as a channel handle', async () => {
        mocks.role = 'admin';

        const res = await testRequest(router, 'POST', '/api/integrations/i1/apps/a1/handles', {body: {channelId: 'C1'}});

        expect(res.status).toBe(201);
        expect(mocks.createHandle).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1'], appId: 'a1', channelId: 'C1'});
    });

    it('move candidates and move are admin only', async () => {
        mocks.role = 'member';

        const list = await testRequest(router, 'GET', '/api/integrations/i1/apps/slack/move-candidates');
        const move = await testRequest(router, 'POST', '/api/integrations/i1/apps/slack/move', {body: {moves: []}});

        expect([list.status, move.status]).toEqual([403, 403]);
        expect(mocks.listMoveCandidates).not.toHaveBeenCalled();
        expect(mocks.moveWebhookHandles).not.toHaveBeenCalled();
    });

    it('move passes the picked channels to the controller', async () => {
        mocks.role = 'admin';
        mocks.moveWebhookHandles.mockResolvedValue({moved: ['w1'], failed: [], webhookAppEmpty: true});
        const moves = [{webhookHandleId: 'w1', channelId: 'C1'}];

        const res = await testRequest(router, 'POST', '/api/integrations/i1/apps/slack/move', {body: {moves}});

        expect(res.status).toBe(200);
        expect(mocks.moveWebhookHandles).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1'], moves});
    });

    it('move rejects malformed moves', async () => {
        mocks.role = 'admin';

        const res = await testRequest(router, 'POST', '/api/integrations/i1/apps/slack/move', {body: {moves: [{webhookHandleId: 'w1'}]}});

        expect(res.status).toBe(400);
        expect(mocks.moveWebhookHandles).not.toHaveBeenCalled();
    });

    it('move candidates are listed for admins', async () => {
        mocks.role = 'admin';
        mocks.listMoveCandidates.mockResolvedValue([{handleId: 'w1', name: 'x', ruleCount: 1}]);

        const res = await testRequest(router, 'GET', '/api/integrations/i1/apps/slack/move-candidates');

        expect(res.status).toBe(200);
        expect(mocks.listMoveCandidates).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1']});
    });
});
