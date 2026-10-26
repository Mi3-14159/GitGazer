import type {APIGatewayProxyEventV2, Context} from 'aws-lambda';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({completeSlackInstall: vi.fn()}));

vi.mock('@/domains/apps/slack-install', () => ({completeSlackInstall: mocks.completeSlackInstall}));
vi.mock('@/domains/integrations/integrations.middleware', () => ({
    addUserIntegrationsToCtx: async ({reqCtx, next}: {reqCtx: {appContext?: unknown}; next: () => Promise<void>}) => {
        reqCtx.appContext = {userId: 1, integrations: ['i1'], integrationRoles: {i1: 'admin'}};
        await next();
    },
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const callbackEvent = (): APIGatewayProxyEventV2 =>
    ({
        version: '2.0',
        routeKey: 'GET /api/slack/oauth/callback',
        rawPath: '/api/slack/oauth/callback',
        rawQueryString: 'code=c&state=s',
        queryStringParameters: {code: 'c', state: 's'},
        cookies: ['oauthState=n'],
        headers: {},
        requestContext: {domainName: 'api.example.com', http: {method: 'GET', path: '/api/slack/oauth/callback'}},
        isBase64Encoded: false,
    }) as unknown as APIGatewayProxyEventV2;

describe('GET /api/slack/oauth/callback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.completeSlackInstall.mockResolvedValue({redirectUrl: 'https://app.example.com/x?slack=installed'});
    });

    it('completes the install for the session user and clears the state cookie', async () => {
        const router = (await import('@/domains/slack/slack.routes')).default;

        const res = await router.resolve(callbackEvent(), {} as Context);

        expect(res.statusCode).toBe(302);
        expect(res.headers?.location ?? res.headers?.Location).toBe('https://app.example.com/x?slack=installed');
        expect(JSON.stringify(res)).toContain('oauthState=;');
        expect(mocks.completeSlackInstall).toHaveBeenCalledWith({
            code: 'c',
            state: 's',
            oauthStateNonce: 'n',
            userId: 1,
            integrationIds: ['i1'],
            integrationRoles: {i1: 'admin'},
        });
    });
});
