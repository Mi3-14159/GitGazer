import {beforeEach, describe, expect, it, vi} from 'vitest';

import router from '@/domains/auth/auth.routes';
import {createApp} from '@/shared/router';
import {testRequest} from '@/shared/hono/test-request';

vi.mock('@gitgazer/backend-core/config', async (importOriginal) => {
    const actual = await importOriginal<{default: {get: (key: string) => unknown}}>();
    return {default: {...actual.default, get: (key: string) => (key === 'allowedFrontendOrigins' ? ['https://localhost'] : actual.default.get(key))}};
});

// logout is not a public route; the token check is not under test here
vi.mock('@/shared/middleware/authentication', () => ({authenticate: async ({next}: {next: () => Promise<void>}) => next()}));

const mocks = vi.hoisted(() => ({buildLoginRedirect: vi.fn(), generateWsToken: vi.fn(), handleOAuthCallback: vi.fn(), refreshTokens: vi.fn()}));

vi.mock('@/domains/auth/auth.controller', () => ({
    buildLoginRedirect: mocks.buildLoginRedirect,
    generateWsToken: mocks.generateWsToken,
    handleOAuthCallback: mocks.handleOAuthCallback,
    refreshTokens: mocks.refreshTokens,
}));
vi.mock('@/domains/integrations/integrations.middleware', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    addUserIntegrationsToCtxHono: async (c: {var: {appContext?: {integrations?: string[]}}}, next: () => Promise<void>) => {
        c.var.appContext!.integrations = ['int-1'];
        await next();
    },
}));

const appContext = {userId: 1, username: 'u', email: 'e', name: '', nickname: '', picture: ''};

const resolve = (fullPath: string, method: string, cookie?: string) => {
    const [path, rawQueryString = ''] = fullPath.split('?');
    return createApp().resolve(
        {
            version: '2.0',
            routeKey: `${method} ${path}`,
            rawPath: path,
            rawQueryString,
            queryStringParameters: Object.fromEntries(new URLSearchParams(rawQueryString)),
            headers: {origin: 'https://localhost', ...(cookie ? {cookie} : {})},
            requestContext: {http: {method, path, sourceIp: '1.1.1.1', userAgent: 'test'}, domainName: 'localhost'},
            isBase64Encoded: false,
        } as never,
        {} as never,
    ) as Promise<{statusCode: number; cookies?: string[]}>;
};

describe('auth routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirects with 302 and Location on login', async () => {
        mocks.buildLoginRedirect.mockReturnValue({location: 'https://idp/login', stateCookie: 'oauthState=n; Secure'});

        const res = await testRequest(router, 'GET', '/api/auth/login?redirect_url=https://app/x');

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://idp/login');
        expect(res.headers.getSetCookie()).toEqual(['oauthState=n; Secure']);
        expect(mocks.buildLoginRedirect).toHaveBeenCalledWith('https://app/x');
    });

    it('sets each auth cookie as its own Set-Cookie header on callback', async () => {
        mocks.handleOAuthCallback.mockResolvedValue({
            cookies: ['accessToken=a; Secure', 'idToken=i; Secure', 'refreshToken=r; Secure'],
            redirectUrl: 'https://app/',
        });

        const res = await testRequest(router, 'GET', '/api/auth/callback?code=c&state=s', {cookies: ['oauthState=nonce']});

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://app/');
        expect(res.headers.getSetCookie()).toHaveLength(4);
        expect(res.headers.getSetCookie()[3]).toContain('oauthState=;');
        expect(mocks.handleOAuthCallback).toHaveBeenCalledWith({code: 'c', state: 's', oauthStateNonce: 'nonce'});

        const result = await resolve('/api/auth/callback?code=c&state=s', 'GET', 'oauthState=nonce');
        expect(result.cookies).toHaveLength(4);
    });

    it('sets each cookie as its own Set-Cookie header on refresh success', async () => {
        mocks.refreshTokens.mockResolvedValue({success: true, cookies: ['accessToken=a', 'idToken=i']});

        const res = await testRequest(router, 'POST', '/api/auth/refresh', {cookies: ['refreshToken=rt']});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({success: true});
        expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, max-age=0');
        expect(res.headers.getSetCookie()).toEqual(['accessToken=a', 'idToken=i']);
        expect(mocks.refreshTokens).toHaveBeenCalledWith('rt');

        const result = await resolve('/api/auth/refresh', 'POST', 'refreshToken=rt');
        expect(result.cookies).toHaveLength(2);
    });

    it('sets each cookie as its own Set-Cookie header on refresh failure', async () => {
        mocks.refreshTokens.mockResolvedValue({success: false, clearCookies: ['accessToken=', 'idToken=', 'refreshToken=']});

        const res = await testRequest(router, 'POST', '/api/auth/refresh', {cookies: ['refreshToken=rt']});

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({error: 'Failed to refresh tokens'});
        expect(res.headers.getSetCookie()).toHaveLength(3);

        const result = await resolve('/api/auth/refresh', 'POST', 'refreshToken=rt');
        expect(result.cookies).toHaveLength(3);
    });

    it('returns 401 on refresh without a refresh token', async () => {
        const res = await testRequest(router, 'POST', '/api/auth/refresh');

        expect(res.status).toBe(401);
        expect(mocks.refreshTokens).not.toHaveBeenCalled();
    });

    it('sets each cleared cookie as its own Set-Cookie header on logout', async () => {
        const res = await testRequest(router, 'GET', '/api/auth/logout?redirect_uri=https://localhost/');

        expect(res.status).toBe(302);
        expect(res.headers.getSetCookie()).toHaveLength(3);
        expect(res.headers.get('Location')).toBeTruthy();

        const result = await resolve('/api/auth/logout?redirect_uri=https://localhost/', 'GET');
        expect(result.cookies).toHaveLength(3);
    });

    it('returns 400 on logout without redirect_uri', async () => {
        const res = await testRequest(router, 'GET', '/api/auth/logout');

        expect(res.status).toBe(400);
    });

    it('GET /api/auth/ws-token returns the generated token', async () => {
        mocks.generateWsToken.mockReturnValue('tok');

        const res = await testRequest(router, 'GET', '/api/auth/ws-token', {appContext: {...appContext}});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({token: 'tok'});
        expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, max-age=0');
    });
});
