import type {APIGatewayProxyEventV2, Context} from 'aws-lambda';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
    completeSlackInstall: vi.fn(),
    buildSlackConnectRedirect: vi.fn(),
    completeSlackSignIn: vi.fn(),
    disconnectSlack: vi.fn(),
}));

vi.mock('@/domains/apps/slack-install', () => ({completeSlackInstall: mocks.completeSlackInstall}));
vi.mock('@/domains/slack/connect', () => ({
    buildSlackConnectRedirect: mocks.buildSlackConnectRedirect,
    completeSlackSignIn: mocks.completeSlackSignIn,
    disconnectSlack: mocks.disconnectSlack,
}));
vi.mock('@/domains/integrations/integrations.middleware', () => ({
    addUserIntegrationsToCtx: async ({reqCtx, next}: {reqCtx: {appContext?: unknown}; next: () => Promise<void>}) => {
        reqCtx.appContext = {userId: 1, integrations: ['i1'], integrationRoles: {i1: 'viewer'}};
        await next();
    },
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const event = (method: string, path: string, query: Record<string, string> = {}): APIGatewayProxyEventV2 =>
    ({
        version: '2.0',
        routeKey: `${method} ${path}`,
        rawPath: path,
        rawQueryString: new URLSearchParams(query).toString(),
        queryStringParameters: query,
        cookies: ['oauthState=n'],
        headers: {},
        requestContext: {domainName: 'api.example.com', http: {method, path}},
        isBase64Encoded: false,
    }) as unknown as APIGatewayProxyEventV2;

const location = (res: {headers?: Record<string, unknown>}) => res.headers?.location ?? res.headers?.Location;

describe('slack routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.completeSlackInstall.mockResolvedValue({redirectUrl: 'https://app.example.com/x?slack=installed'});
        mocks.completeSlackSignIn.mockResolvedValue({redirectUrl: 'https://app.example.com/x?slack=connected'});
        mocks.buildSlackConnectRedirect.mockReturnValue({
            location: 'https://slack.com/openid/connect/authorize?state=s',
            stateCookie: 'oauthState=n2',
        });
        mocks.disconnectSlack.mockResolvedValue(undefined);
    });

    it('completes the install for the session user and clears the state cookie', async () => {
        const router = (await import('@/domains/slack/slack.routes')).default;

        const res = await router.resolve(event('GET', '/api/slack/oauth/callback', {code: 'c', state: 's'}), {} as Context);

        expect(res.statusCode).toBe(302);
        expect(location(res)).toBe('https://app.example.com/x?slack=installed');
        expect(JSON.stringify(res)).toContain('oauthState=;');
        expect(mocks.completeSlackInstall).toHaveBeenCalledWith({
            code: 'c',
            state: 's',
            oauthStateNonce: 'n',
            userId: 1,
            integrationIds: ['i1'],
            integrationRoles: {i1: 'viewer'},
        });
    });

    it('starts Sign in with Slack for the session user', async () => {
        const router = (await import('@/domains/slack/slack.routes')).default;

        const res = await router.resolve(
            event('GET', '/api/integrations/i1/slack/connect', {redirect_url: 'https://app.example.com/x', userId: '99'}),
            {} as Context,
        );

        expect(res.statusCode).toBe(302);
        expect(location(res)).toBe('https://slack.com/openid/connect/authorize?state=s');
        expect(JSON.stringify(res)).toContain('oauthState=n2');
        expect(mocks.buildSlackConnectRedirect).toHaveBeenCalledWith({integrationId: 'i1', userId: 1, redirectUrl: 'https://app.example.com/x'});
    });

    it('rejects connect for a non-member', async () => {
        const router = (await import('@/domains/slack/slack.routes')).default;

        const res = await router.resolve(
            event('GET', '/api/integrations/i2/slack/connect', {redirect_url: 'https://app.example.com/x'}),
            {} as Context,
        );

        expect(res.statusCode).toBe(403);
        expect(mocks.buildSlackConnectRedirect).not.toHaveBeenCalled();
    });

    it('completes Sign in with Slack for the session user and clears the state cookie', async () => {
        const router = (await import('@/domains/slack/slack.routes')).default;

        const res = await router.resolve(event('GET', '/api/slack/sign-in/callback', {code: 'c', state: 's'}), {} as Context);

        expect(res.statusCode).toBe(302);
        expect(location(res)).toBe('https://app.example.com/x?slack=connected');
        expect(JSON.stringify(res)).toContain('oauthState=;');
        expect(mocks.completeSlackSignIn).toHaveBeenCalledWith({
            code: 'c',
            state: 's',
            oauthStateNonce: 'n',
            userId: 1,
            integrationIds: ['i1'],
            integrationRoles: {i1: 'viewer'},
        });
    });

    it('disconnects only the session user', async () => {
        const router = (await import('@/domains/slack/slack.routes')).default;

        const res = await router.resolve(event('DELETE', '/api/integrations/i1/slack/connection'), {} as Context);

        expect(res.statusCode).toBe(204);
        expect(mocks.disconnectSlack).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1'], userId: 1});
    });
});
