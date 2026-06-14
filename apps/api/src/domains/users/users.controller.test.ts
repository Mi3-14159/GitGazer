import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockProxyFetch = vi.fn();
vi.mock('@/shared/clients/proxy-fetch', () => ({
    proxyFetch: (...args: any[]) => mockProxyFetch(...args),
}));

// The GitHub OAuth app credentials always come from server config, never the caller.
vi.mock('@/shared/config', () => ({
    default: {
        get: (key: string): string => {
            switch (key) {
                case 'githubOAuthApp.clientId':
                    return 'configured-client-id';
                case 'githubOAuthApp.clientSecret':
                    return 'configured-client-secret';
                default:
                    return '';
            }
        },
    },
}));

vi.mock('@/shared/logger', () => ({
    getLogger: () => ({error: vi.fn(), info: vi.fn(), warn: vi.fn()}),
}));

import {exchangeGitHubOAuthToken, fetchGitHubUser, parseOAuthTokenBody} from './users.controller';

const res = (status: number, headers: Record<string, string> = {}, body = ''): Response => new Response(body || null, {status, headers});

describe('exchangeGitHubOAuthToken', () => {
    beforeEach(() => {
        mockProxyFetch.mockReset();
    });

    it('exchanges using the configured client credentials and the caller code, ignoring caller-supplied secrets', async () => {
        mockProxyFetch.mockResolvedValue(res(200, {'Content-Type': 'application/json'}, JSON.stringify({access_token: 'gho_token'})));

        const token = await exchangeGitHubOAuthToken('caller-auth-code');

        expect(token).toEqual({access_token: 'gho_token'});
        expect(mockProxyFetch).toHaveBeenCalledTimes(1);

        const [url, init] = mockProxyFetch.mock.calls[0];
        expect(url).toBe('https://github.com/login/oauth/access_token');
        expect(init.method).toBe('POST');
        // Credentials must be the configured ones, never anything from the request body.
        expect(JSON.parse(init.body)).toEqual({
            client_id: 'configured-client-id',
            client_secret: 'configured-client-secret',
            code: 'caller-auth-code',
        });
    });

    it('throws a generic error and does not reflect upstream error text on failure', async () => {
        const upstreamDetail = 'UPSTREAM_SECRET_ERROR_DETAIL';
        mockProxyFetch.mockResolvedValue(res(401, {}, JSON.stringify({error: upstreamDetail, error_description: upstreamDetail})));

        const error = await exchangeGitHubOAuthToken('bad-code').catch((e: unknown) => e as Error);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(upstreamDetail);
    });

    it('throws a generic error when GitHub returns HTTP 200 with an error body, without reflecting upstream text', async () => {
        // GitHub responds 200 OK with an error payload for invalid/expired/already-used codes.
        const upstreamError = 'bad_verification_code';
        const upstreamDescription = 'UPSTREAM_200_ERROR_DESCRIPTION';
        mockProxyFetch.mockResolvedValue(
            res(200, {'Content-Type': 'application/json'}, JSON.stringify({error: upstreamError, error_description: upstreamDescription})),
        );

        const error = await exchangeGitHubOAuthToken('expired-code').catch((e: unknown) => e as Error);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(upstreamError);
        expect((error as Error).message).not.toContain(upstreamDescription);
    });
});

describe('fetchGitHubUser', () => {
    beforeEach(() => {
        mockProxyFetch.mockReset();
    });

    it('returns the user profile with a sub claim on success', async () => {
        mockProxyFetch.mockResolvedValue(res(200, {}, JSON.stringify({id: 4242, login: 'octocat'})));

        const result = await fetchGitHubUser('Bearer gho_user_token');

        expect(result.status).toBe(200);
        expect(JSON.parse(result.body)).toEqual({sub: 4242, id: 4242, login: 'octocat'});
    });

    it('returns a generic body without reflecting upstream error text on failure', async () => {
        const upstreamDetail = 'UPSTREAM_USER_SECRET_DETAIL';
        mockProxyFetch.mockResolvedValue(res(403, {}, JSON.stringify({message: upstreamDetail})));

        const result = await fetchGitHubUser('Bearer revoked');

        expect(result.status).toBe(403);
        expect(result.body).not.toContain(upstreamDetail);
        expect(JSON.parse(result.body)).toEqual({error: 'Failed to fetch user info from GitHub'});
    });
});

describe('parseOAuthTokenBody (drives the route 400 guard)', () => {
    it('parses a urlencoded body and exposes the code', () => {
        const result = parseOAuthTokenBody('grant_type=authorization_code&code=abc123', false);

        expect(result.code).toBe('abc123');
        // users.routes.ts: !result.code === false here, so no 400 is thrown.
        expect(!result.code).toBe(false);
    });

    it('yields no code when absent, so the route guard rejects the request (400)', () => {
        const result = parseOAuthTokenBody('grant_type=authorization_code', false);

        // users.routes.ts throws BadRequestError (400) when !result.code is true.
        expect(result.code).toBeUndefined();
        expect(!result.code).toBe(true);
    });

    it('decodes a base64-encoded body', () => {
        const encoded = Buffer.from('code=xyz789', 'utf-8').toString('base64');

        const result = parseOAuthTokenBody(encoded, true);

        expect(result.code).toBe('xyz789');
    });
});
