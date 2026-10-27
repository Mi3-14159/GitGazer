import type {APIGatewayProxyEventV2, Context} from 'aws-lambda';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({assertCognitoCaller: vi.fn(), exchangeGitHubOAuthToken: vi.fn(), fetchGitHubUser: vi.fn()}));

vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => ['https://app.example.com'])}, loadConfig: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({db: {}, withRlsTransaction: vi.fn()}));
vi.mock('@/domains/users/users.controller', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/domains/users/users.controller')>()),
    assertCognitoCaller: mocks.assertCognitoCaller,
    exchangeGitHubOAuthToken: mocks.exchangeGitHubOAuthToken,
    fetchGitHubUser: mocks.fetchGitHubUser,
}));

import router from '@/domains/users/users.routes';
import {testRequest} from '@/shared/hono/test-request';
import {createApp} from '@/shared/router';

const appContext = {userId: 1, username: 'octo', email: 'o@example.com', name: 'Octo', nickname: 'oc', picture: 'p'};

const tokenEvent = (body: string, isBase64Encoded: boolean): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: '$default',
    rawPath: '/api/auth/cognito/token',
    rawQueryString: '',
    headers: {host: 'api.example.com', 'content-type': 'application/x-www-form-urlencoded'},
    requestContext: {
        accountId: '123',
        apiId: 'api',
        domainName: 'api.example.com',
        domainPrefix: 'api',
        http: {method: 'POST', path: '/api/auth/cognito/token', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest'},
        requestId: 'req-1',
        routeKey: '$default',
        stage: '$default',
        time: '',
        timeEpoch: 0,
    },
    body,
    isBase64Encoded,
});

describe('users routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('POST /api/auth/cognito/token returns the parse status and body for a form-encoded body', async () => {
        mocks.exchangeGitHubOAuthToken.mockResolvedValue({access_token: 'gho'});

        const res = await testRequest(router, 'POST', '/api/auth/cognito/token', {body: 'client_id=id&client_secret=secret&code=abc123'});

        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-cache, no-store, max-age=0');
        expect(res.headers.get('content-type')).toBe('application/json');
        expect(await res.json()).toEqual({access_token: 'gho'});
        expect(mocks.assertCognitoCaller).toHaveBeenCalledWith('id', 'secret');
        expect(mocks.exchangeGitHubOAuthToken).toHaveBeenCalledWith('abc123');
    });

    it('POST /api/auth/cognito/token returns the parse status and body for a base64 event body through the bridge', async () => {
        mocks.exchangeGitHubOAuthToken.mockResolvedValue({access_token: 'gho'});
        const encoded = Buffer.from('client_id=id&client_secret=secret&code=xyz789', 'utf-8').toString('base64');

        const res = await createApp().resolve(tokenEvent(encoded, true), {} as Context);

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body!)).toEqual({access_token: 'gho'});
        expect(mocks.exchangeGitHubOAuthToken).toHaveBeenCalledWith('xyz789');
    });

    it('POST /api/auth/cognito/token rejects a missing body and a missing code', async () => {
        const missingBody = await testRequest(router, 'POST', '/api/auth/cognito/token');
        const missingCode = await testRequest(router, 'POST', '/api/auth/cognito/token', {body: 'grant_type=authorization_code'});

        expect(missingBody.status).toBe(400);
        expect((await missingBody.json()).message).toBe('Missing request body');
        expect(missingCode.status).toBe(400);
        expect((await missingCode.json()).message).toBe('Missing required parameters');
        expect(mocks.exchangeGitHubOAuthToken).not.toHaveBeenCalled();
    });

    it('GET /api/auth/cognito/user passes the upstream status, headers and body through', async () => {
        const headers = {'Cache-Control': 'no-cache, no-store, max-age=0', 'Content-Type': 'application/json'};
        mocks.fetchGitHubUser.mockResolvedValue({status: 401, headers, body: '{"error":"Failed to fetch user info from GitHub"}'});

        const res = await testRequest(router, 'GET', '/api/auth/cognito/user', {headers: {authorization: 'Bearer t'}});

        expect(res.status).toBe(401);
        expect(res.headers.get('cache-control')).toBe('no-cache, no-store, max-age=0');
        expect(await res.json()).toEqual({error: 'Failed to fetch user info from GitHub'});
        expect(mocks.fetchGitHubUser).toHaveBeenCalledWith('Bearer t');
    });

    it('GET /api/auth/cognito/user sends an empty authorization header when none is given', async () => {
        mocks.fetchGitHubUser.mockResolvedValue({status: 200, headers: {}, body: '{}'});

        await testRequest(router, 'GET', '/api/auth/cognito/user');

        expect(mocks.fetchGitHubUser).toHaveBeenCalledWith('');
    });

    it('GET /api/user returns the user attributes without caching', async () => {
        const res = await testRequest(router, 'GET', '/api/user', {appContext});

        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-cache, no-store, max-age=0');
        expect(await res.json()).toEqual(appContext);
    });

    it('GET /api/user is forbidden without a userId', async () => {
        const res = await testRequest(router, 'GET', '/api/user', {appContext: {...appContext, userId: 0}});

        expect(res.status).toBe(403);
    });
});
