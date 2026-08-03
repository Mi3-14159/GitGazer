import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/shared/config', () => ({
    default: {
        get: vi.fn((key: string) => {
            switch (key) {
                case 'mcpServerUrl':
                    return 'https://app.gitgazer.com/api/mcp';
                case 'stateSecret':
                    return 'test-state-secret-0123456789';
                case 'cognito':
                    return {domain: 'auth.gitgazer.com', mcpClientId: 'mcp-client-123'};
                case 'mcpAllowedRedirectHosts':
                    return ['vscode.dev', 'claude.ai'];
                default:
                    return undefined;
            }
        }),
    },
}));
// mcp-oauth.controller imports mcpOrigin from mcp.controller, which loads these at module init.
vi.mock('@/shared/middleware/token-verifier', () => ({getMcpAccessVerifier: () => ({verify: vi.fn()})}));
vi.mock('@/domains/integrations/integrations.controller', () => ({getUserIntegrationRoles: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({db: {select: vi.fn()}}));

let ctrl: typeof import('@/domains/mcp/mcp-oauth.controller');

const event = (query: Record<string, string>, body?: string): never =>
    ({queryStringParameters: query, requestContext: {domainName: 'api.example.com'}, body, isBase64Encoded: false}) as never;

const validAuthorizeQuery = {
    response_type: 'code',
    redirect_uri: 'http://127.0.0.1:33418/callback',
    code_challenge: 'CHALLENGE_ABC',
    code_challenge_method: 'S256',
    state: 'client-xyz',
    scope: 'openid email profile',
};

beforeEach(async () => {
    vi.clearAllMocks();
    ctrl = await import('@/domains/mcp/mcp-oauth.controller');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('buildAuthServerMetadata', () => {
    it('advertises our proxy endpoints and PKCE/none client auth', () => {
        expect(ctrl.buildAuthServerMetadata(event({}))).toMatchObject({
            issuer: 'https://app.gitgazer.com',
            authorization_endpoint: 'https://app.gitgazer.com/api/mcp/oauth/authorize',
            token_endpoint: 'https://app.gitgazer.com/api/mcp/oauth/token',
            registration_endpoint: 'https://app.gitgazer.com/api/mcp/oauth/register',
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
            authorization_response_iss_parameter_supported: true,
        });
    });
});

describe('handleRegister', () => {
    it('returns the pre-provisioned public client id and echoes redirect_uris', () => {
        const reg = ctrl.handleRegister(JSON.stringify({redirect_uris: ['http://127.0.0.1:5/cb', 42]}));
        expect(reg).toMatchObject({
            client_id: 'mcp-client-123',
            redirect_uris: ['http://127.0.0.1:5/cb'],
            token_endpoint_auth_method: 'none',
        });
    });

    it('tolerates an empty body', () => {
        expect(ctrl.handleRegister(undefined)).toMatchObject({client_id: 'mcp-client-123', redirect_uris: []});
    });

    it('rejects a malformed body', () => {
        expect(() => ctrl.handleRegister('{not json')).toThrow(/Invalid registration/);
    });
});

describe('handleAuthorize', () => {
    it('redirects to Cognito with our callback, PKCE passthrough, and a signed state', () => {
        const url = new URL(ctrl.handleAuthorize(event(validAuthorizeQuery)));
        expect(`${url.origin}${url.pathname}`).toBe('https://auth.gitgazer.com/oauth2/authorize');
        expect(url.searchParams.get('client_id')).toBe('mcp-client-123');
        expect(url.searchParams.get('redirect_uri')).toBe('https://app.gitgazer.com/api/mcp/oauth/callback');
        expect(url.searchParams.get('code_challenge')).toBe('CHALLENGE_ABC');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('scope')).toBe('openid email profile');
        expect(url.searchParams.get('identity_provider')).toBe('Github');
        expect(url.searchParams.get('state')).toBeTruthy();
    });

    it('rejects an unsupported response_type', () => {
        expect(() => ctrl.handleAuthorize(event({...validAuthorizeQuery, response_type: 'token'}))).toThrow(/response_type/);
    });

    it('rejects a redirect_uri outside the allowlist (open-redirect gate)', () => {
        expect(() => ctrl.handleAuthorize(event({...validAuthorizeQuery, redirect_uri: 'https://evil.example.com/cb'}))).toThrow(/redirect_uri/);
    });

    it('accepts the redirect styles used by MCP clients (loopback + vscode.dev + claude.ai)', () => {
        for (const redirect_uri of [
            'http://127.0.0.1:33418/callback',
            'http://localhost:51000/callback', // Claude Code / VS Code native loopback
            'http://127.0.0.2:8080/cb', // 127.0.0.0/8 loopback block
            'https://vscode.dev/redirect',
            'https://claude.ai/api/mcp/auth_callback', // Claude Desktop / claude.ai connectors
        ]) {
            expect(() => ctrl.handleAuthorize(event({...validAuthorizeQuery, redirect_uri}))).not.toThrow();
        }
    });

    it('rejects open-redirect bypass vectors on the redirect_uri', () => {
        for (const redirect_uri of [
            'https://vscode.dev@evil.com/x', // userinfo trick -> host is evil.com
            'https://vscode.dev.evil.com/x', // suffix
            'https://sub.vscode.dev/x', // non-allowlisted subdomain
            'https://vscode.dev./redirect', // trailing dot
            'http://localhost.evil.com/cb', // loopback-looking host
            'http://127.0.0.1.evil.com/cb',
        ]) {
            expect(() => ctrl.handleAuthorize(event({...validAuthorizeQuery, redirect_uri}))).toThrow(/redirect_uri/);
        }
    });

    it('requires PKCE with S256', () => {
        expect(() => ctrl.handleAuthorize(event({...validAuthorizeQuery, code_challenge: '', code_challenge_method: 'plain'}))).toThrow(/PKCE/);
    });
});

describe('handleCallback', () => {
    // Produce a genuine signed state by running authorize first.
    const signedState = (): string => new URL(ctrl.handleAuthorize(event(validAuthorizeQuery))).searchParams.get('state')!;

    it('relays the code and client state back to the original redirect_uri', () => {
        const url = new URL(ctrl.handleCallback(event({state: signedState(), code: 'AUTH_CODE'})));
        expect(`${url.origin}${url.pathname}`).toBe('http://127.0.0.1:33418/callback');
        expect(url.searchParams.get('code')).toBe('AUTH_CODE');
        expect(url.searchParams.get('state')).toBe('client-xyz');
        expect(url.searchParams.get('iss')).toBe('https://app.gitgazer.com');
    });

    it('relays OAuth errors back to the client', () => {
        const url = new URL(ctrl.handleCallback(event({state: signedState(), error: 'access_denied', error_description: 'nope'})));
        expect(url.searchParams.get('error')).toBe('access_denied');
        expect(url.searchParams.get('error_description')).toBe('nope');
        expect(url.searchParams.get('iss')).toBe('https://app.gitgazer.com');
    });

    it('rejects a forged or missing state', () => {
        expect(() => ctrl.handleCallback(event({state: 'forged.signature', code: 'x'}))).toThrow(/Invalid or expired/);
        expect(() => ctrl.handleCallback(event({code: 'x'}))).toThrow(/Invalid or expired/);
    });

    it('rejects a state whose payload was tampered (signature mismatch)', () => {
        const [, sig] = signedState().split('.');
        const forgedPayload = Buffer.from(JSON.stringify({redirectUri: 'http://127.0.0.1:1/cb', exp: 9999999999})).toString('base64url');
        expect(() => ctrl.handleCallback(event({state: `${forgedPayload}.${sig}`, code: 'x'}))).toThrow(/Invalid or expired/);
    });

    it('rejects an expired state (past the 600s TTL)', () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-07-22T00:00:00.000Z'));
            const state = signedState();
            vi.setSystemTime(new Date('2026-07-22T00:20:00.000Z')); // +20 min > TTL
            expect(() => ctrl.handleCallback(event({state, code: 'AUTH_CODE'}))).toThrow(/Invalid or expired/);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('handleToken', () => {
    it('forces our client id + callback and relays Cognito response verbatim', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ok: true, status: 200, text: () => Promise.resolve('{"access_token":"tok"}')});
        vi.stubGlobal('fetch', fetchMock);

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: 'AUTH_CODE',
            code_verifier: 'VERIFIER',
            redirect_uri: 'http://127.0.0.1:33418/callback',
            client_id: 'ignored',
        }).toString();

        const res = await ctrl.handleToken(event({}), body, false);
        expect(res).toEqual({status: 200, body: '{"access_token":"tok"}'});

        expect(fetchMock).toHaveBeenCalledWith('https://auth.gitgazer.com/oauth2/token', expect.objectContaining({method: 'POST'}));
        const sent = new URLSearchParams((fetchMock.mock.calls[0][1] as {body: string}).body);
        expect(sent.get('client_id')).toBe('mcp-client-123');
        expect(sent.get('redirect_uri')).toBe('https://app.gitgazer.com/api/mcp/oauth/callback');
        expect(sent.get('code_verifier')).toBe('VERIFIER');
        expect(sent.get('grant_type')).toBe('authorization_code');
    });

    it('relays a non-OK status from Cognito', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false, status: 400, text: () => Promise.resolve('{"error":"invalid_grant"}')}));
        const res = await ctrl.handleToken(event({}), 'grant_type=authorization_code', false);
        expect(res).toEqual({status: 400, body: '{"error":"invalid_grant"}'});
    });

    it('decodes a base64-encoded request body', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ok: true, status: 200, text: () => Promise.resolve('{}')});
        vi.stubGlobal('fetch', fetchMock);
        const raw = Buffer.from('grant_type=refresh_token&refresh_token=RT').toString('base64');
        await ctrl.handleToken(event({}), raw, true);
        const sent = new URLSearchParams((fetchMock.mock.calls[0][1] as {body: string}).body);
        expect(sent.get('grant_type')).toBe('refresh_token');
        expect(sent.get('refresh_token')).toBe('RT');
        // refresh grant must NOT get a redirect_uri injected
        expect(sent.get('redirect_uri')).toBeNull();
    });
});
