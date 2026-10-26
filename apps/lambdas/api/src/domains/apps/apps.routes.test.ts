import type {APIGatewayProxyEventV2, Context} from 'aws-lambda';
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
    addUserIntegrationsToCtx: async ({reqCtx, next}: {reqCtx: {appContext?: unknown}; next: () => Promise<void>}) => {
        reqCtx.appContext = {userId: 1, integrations: ['i1'], integrationRoles: {i1: mocks.role}};
        await next();
    },
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const routeEvent = (method: string, path: string, extra: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 =>
    ({
        version: '2.0',
        routeKey: `${method} ${path}`,
        rawPath: path,
        rawQueryString: '',
        headers: {},
        requestContext: {domainName: 'api.example.com', http: {method, path}},
        isBase64Encoded: false,
        ...extra,
    }) as unknown as APIGatewayProxyEventV2;

const listEvent = () => routeEvent('GET', '/api/integrations/i1/apps');

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
        const router = (await import('@/domains/apps/apps.routes')).default;

        const res = await router.resolve(listEvent(), {} as Context);

        expect(res.statusCode).toBe(200);
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
        const router = (await import('@/domains/apps/apps.routes')).default;

        const res = await router.resolve(routeEvent('GET', '/api/integrations/i1/apps/a1/slack/channels'), {} as Context);

        expect(res.statusCode).toBe(status);
        expect(mocks.listSlackChannels).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    });

    it('install redirects admins to Slack with the state cookie', async () => {
        mocks.role = 'admin';
        const router = (await import('@/domains/apps/apps.routes')).default;
        const event = routeEvent('GET', '/api/integrations/i1/apps/slack/install', {
            queryStringParameters: {redirect_url: 'https://app.example.com/x'},
        });

        const res = await router.resolve(event, {} as Context);

        expect(res.statusCode).toBe(302);
        expect(res.headers?.location ?? res.headers?.Location).toBe('https://slack.com/oauth/v2/authorize?state=s');
        expect(JSON.stringify(res)).toContain('oauthState=n');
        expect(mocks.buildSlackInstallRedirect).toHaveBeenCalledWith({integrationId: 'i1', userId: 1, redirectUrl: 'https://app.example.com/x'});
    });

    it('install is admin only', async () => {
        mocks.role = 'member';
        const router = (await import('@/domains/apps/apps.routes')).default;

        const res = await router.resolve(routeEvent('GET', '/api/integrations/i1/apps/slack/install'), {} as Context);

        expect(res.statusCode).toBe(403);
        expect(mocks.buildSlackInstallRedirect).not.toHaveBeenCalled();
    });

    it('a handle with a channelId is created as a channel handle', async () => {
        mocks.role = 'admin';
        const router = (await import('@/domains/apps/apps.routes')).default;
        const event = routeEvent('POST', '/api/integrations/i1/apps/a1/handles', {body: JSON.stringify({channelId: 'C1'})});

        const res = await router.resolve(event, {} as Context);

        expect(res.statusCode).toBe(201);
        expect(mocks.createHandle).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1'], appId: 'a1', channelId: 'C1'});
    });

    it('move candidates and move are admin only', async () => {
        mocks.role = 'member';
        const router = (await import('@/domains/apps/apps.routes')).default;
        const body = JSON.stringify({moves: []});

        const list = await router.resolve(routeEvent('GET', '/api/integrations/i1/apps/slack/move-candidates'), {} as Context);
        const move = await router.resolve(routeEvent('POST', '/api/integrations/i1/apps/slack/move', {body}), {} as Context);

        expect([list.statusCode, move.statusCode]).toEqual([403, 403]);
        expect(mocks.listMoveCandidates).not.toHaveBeenCalled();
        expect(mocks.moveWebhookHandles).not.toHaveBeenCalled();
    });

    it('move passes the picked channels to the controller', async () => {
        mocks.role = 'admin';
        mocks.moveWebhookHandles.mockResolvedValue({moved: ['w1'], failed: [], webhookAppEmpty: true});
        const router = (await import('@/domains/apps/apps.routes')).default;
        const moves = [{webhookHandleId: 'w1', channelId: 'C1'}];

        const res = await router.resolve(routeEvent('POST', '/api/integrations/i1/apps/slack/move', {body: JSON.stringify({moves})}), {} as Context);

        expect(res.statusCode).toBe(200);
        expect(mocks.moveWebhookHandles).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1'], moves});
    });

    it('move rejects malformed moves', async () => {
        mocks.role = 'admin';
        const router = (await import('@/domains/apps/apps.routes')).default;

        const res = await router.resolve(
            routeEvent('POST', '/api/integrations/i1/apps/slack/move', {body: JSON.stringify({moves: [{webhookHandleId: 'w1'}]})}),
            {} as Context,
        );

        expect(res.statusCode).toBe(400);
        expect(mocks.moveWebhookHandles).not.toHaveBeenCalled();
    });

    it('move candidates are listed for admins', async () => {
        mocks.role = 'admin';
        mocks.listMoveCandidates.mockResolvedValue([{handleId: 'w1', name: 'x', ruleCount: 1}]);
        const router = (await import('@/domains/apps/apps.routes')).default;

        const res = await router.resolve(routeEvent('GET', '/api/integrations/i1/apps/slack/move-candidates'), {} as Context);

        expect(res.statusCode).toBe(200);
        expect(mocks.listMoveCandidates).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1']});
    });
});
