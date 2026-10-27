import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({assertCognitoCaller: vi.fn(), exchangeGitHubOAuthToken: vi.fn(), fetchGitHubUser: vi.fn()}));

vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => ['https://app.example.com'])}, loadConfig: vi.fn()}));
vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/db/client', () => ({db: {}, initDb: vi.fn(), withRlsTransaction: vi.fn()}));
vi.mock('@/domains/users/users.controller', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/domains/users/users.controller')>()),
    assertCognitoCaller: mocks.assertCognitoCaller,
    exchangeGitHubOAuthToken: mocks.exchangeGitHubOAuthToken,
    fetchGitHubUser: mocks.fetchGitHubUser,
}));

import router from '@/domains/users/users.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';

const app = new Hono<AppEnv>().route('/api', router);

const appContext = {userId: 1, username: 'octo', email: 'o@example.com', name: 'Octo', nickname: 'oc', picture: 'p'};

describe('users routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('POST /api/auth/cognito/token returns the parse status and body for a form-encoded body', async () => {
        mocks.exchangeGitHubOAuthToken.mockResolvedValue({access_token: 'gho'});

        const res = await testRequest(app, 'POST', '/api/auth/cognito/token', {body: 'client_id=id&client_secret=secret&code=abc123'});

        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-cache, no-store, max-age=0');
        expect(res.headers.get('content-type')).toBe('application/json');
        expect(await res.json()).toEqual({access_token: 'gho'});
        expect(mocks.assertCognitoCaller).toHaveBeenCalledWith('id', 'secret');
        expect(mocks.exchangeGitHubOAuthToken).toHaveBeenCalledWith('abc123');
    });

    it('POST /api/auth/cognito/token rejects a missing body and a missing code', async () => {
        const missingBody = await testRequest(app, 'POST', '/api/auth/cognito/token');
        const missingCode = await testRequest(app, 'POST', '/api/auth/cognito/token', {body: 'grant_type=authorization_code'});

        expect(missingBody.status).toBe(400);
        expect((await missingBody.json()).message).toBe('Missing request body');
        expect(missingCode.status).toBe(400);
        expect((await missingCode.json()).message).toBe('Missing required parameters');
        expect(mocks.exchangeGitHubOAuthToken).not.toHaveBeenCalled();
    });

    it('GET /api/auth/cognito/user passes the upstream status, headers and body through', async () => {
        const headers = {'Cache-Control': 'no-cache, no-store, max-age=0', 'Content-Type': 'application/json'};
        mocks.fetchGitHubUser.mockResolvedValue({status: 401, headers, body: '{"error":"Failed to fetch user info from GitHub"}'});

        const res = await testRequest(app, 'GET', '/api/auth/cognito/user', {headers: {authorization: 'Bearer t'}});

        expect(res.status).toBe(401);
        expect(res.headers.get('cache-control')).toBe('no-cache, no-store, max-age=0');
        expect(await res.json()).toEqual({error: 'Failed to fetch user info from GitHub'});
        expect(mocks.fetchGitHubUser).toHaveBeenCalledWith('Bearer t');
    });

    it('GET /api/auth/cognito/user sends an empty authorization header when none is given', async () => {
        mocks.fetchGitHubUser.mockResolvedValue({status: 200, headers: {}, body: '{}'});

        await testRequest(app, 'GET', '/api/auth/cognito/user');

        expect(mocks.fetchGitHubUser).toHaveBeenCalledWith('');
    });

    it('GET /api/user returns the user attributes without caching', async () => {
        const res = await testRequest(app, 'GET', '/api/user', {appContext});

        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-cache, no-store, max-age=0');
        expect(await res.json()).toEqual(appContext);
    });

    it('GET /api/user is forbidden without a userId', async () => {
        const res = await testRequest(app, 'GET', '/api/user', {appContext: {...appContext, userId: 0}});

        expect(res.status).toBe(403);
    });
});
