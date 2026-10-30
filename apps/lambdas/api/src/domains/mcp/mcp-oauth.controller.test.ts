import {BadRequestError, ForbiddenError} from '@/shared/errors';
import {mintSignedState} from '@/domains/auth/auth.controller';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/backend-core/config', () => ({
    default: {
        get: vi.fn((key: string) => {
            switch (key) {
                case 'mcpServerUrl':
                    return 'https://app.gitgazer.com/api/mcp';
                case 'stateSecret':
                    return 'test-state-secret-0123456789';
                case 'cognito':
                    return {domain: 'auth.gitgazer.com', mcpClientId: 'mcp-client-123'};
                case 'allowedFrontendOrigins':
                    return ['https://app.gitgazer.com'];
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

const origin = 'https://api.example.com';

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
        expect(ctrl.buildAuthServerMetadata(origin)).toMatchObject({
            issuer: 'https://app.gitgazer.com',
            authorization_endpoint: 'https://app.gitgazer.com/api/mcp/oauth/authorize',
            token_endpoint: 'https://app.gitgazer.com/api/mcp/oauth/token',
            registration_endpoint: 'https://app.gitgazer.com/api/mcp/oauth/register',
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
            authorization_response_iss_parameter_supported: true,
            scopes_supported: ['openid', 'email', 'profile', 'gitgazer-mcp/read', 'gitgazer-mcp/write'],
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
        expect(ctrl.handleRegister('')).toMatchObject({client_id: 'mcp-client-123', redirect_uris: []});
    });

    it('rejects a malformed body', () => {
        expect(() => ctrl.handleRegister('{not json')).toThrow(/Invalid registration/);
    });
});

const frontendOrigin = 'https://app.gitgazer.com';
const connectRequest = (query: Record<string, string> = validAuthorizeQuery): string =>
    new URL(ctrl.handleAuthorize(origin, query)).searchParams.get('request')!;
const confirm = (session: string | undefined = 'read', query: Record<string, string> = validAuthorizeQuery) =>
    ctrl.handleAuthorizeConfirm(origin, frontendOrigin, {request: connectRequest(query), session});
const nonceOf = (stateCookie: string): string => /^oauthState=([^;]+)/.exec(stateCookie)![1];

describe('handleAuthorize', () => {
    it('redirects to the connect page with a signed request', () => {
        const url = new URL(ctrl.handleAuthorize(origin, validAuthorizeQuery));
        expect(`${url.origin}${url.pathname}`).toBe('https://app.gitgazer.com/mcp/connect');
        expect(url.searchParams.get('request')).toBeTruthy();
    });

    it('rejects an unsupported response_type', () => {
        expect(() => ctrl.handleAuthorize(origin, {...validAuthorizeQuery, response_type: 'token'})).toThrow(/response_type/);
    });

    it('rejects a redirect_uri outside the allowlist (open-redirect gate)', () => {
        expect(() => ctrl.handleAuthorize(origin, {...validAuthorizeQuery, redirect_uri: 'https://evil.example.com/cb'})).toThrow(/redirect_uri/);
    });

    it('accepts the redirect styles used by MCP clients (loopback + vscode.dev + claude.ai)', () => {
        for (const redirect_uri of [
            'http://127.0.0.1:33418/callback',
            'http://localhost:51000/callback', // Claude Code / VS Code native loopback
            'http://127.0.0.2:8080/cb', // 127.0.0.0/8 loopback block
            'https://vscode.dev/redirect',
            'https://claude.ai/api/mcp/auth_callback', // Claude Desktop / claude.ai connectors
        ]) {
            expect(() => ctrl.handleAuthorize(origin, {...validAuthorizeQuery, redirect_uri})).not.toThrow();
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
            expect(() => ctrl.handleAuthorize(origin, {...validAuthorizeQuery, redirect_uri})).toThrow(/redirect_uri/);
        }
    });

    it('requires PKCE with S256', () => {
        expect(() => ctrl.handleAuthorize(origin, {...validAuthorizeQuery, code_challenge: '', code_challenge_method: 'plain'})).toThrow(/PKCE/);
    });
});

describe('handleAuthorizeConfirm', () => {
    it('redirects to Cognito with PKCE, our callback and a bound state', () => {
        const {location, stateCookie} = confirm('read');
        const url = new URL(location);
        expect(`${url.origin}${url.pathname}`).toBe('https://auth.gitgazer.com/oauth2/authorize');
        expect(url.searchParams.get('client_id')).toBe('mcp-client-123');
        expect(url.searchParams.get('redirect_uri')).toBe('https://app.gitgazer.com/api/mcp/oauth/callback');
        expect(url.searchParams.get('code_challenge')).toBe('CHALLENGE_ABC');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('identity_provider')).toBe('Github');
        expect(url.searchParams.get('state')).toBeTruthy();
        expect(stateCookie.startsWith('oauthState=')).toBe(true);
    });

    it("ignores the client's scope", () => {
        for (const scope of ['gitgazer-mcp/write', '', undefined, 'openid']) {
            const query: Record<string, string> = {...validAuthorizeQuery};
            if (scope === undefined) delete query.scope;
            else query.scope = scope;
            expect(new URL(confirm('read', query).location).searchParams.get('scope')).toBe('openid email profile gitgazer-mcp/read');
            expect(new URL(confirm('write', query).location).searchParams.get('scope')).toBe(
                'openid email profile gitgazer-mcp/read gitgazer-mcp/write',
            );
        }
    });

    it('adds the write scope only for session write', () => {
        expect(new URL(confirm('read').location).searchParams.get('scope')).not.toContain('gitgazer-mcp/write');
        expect(new URL(confirm('write').location).searchParams.get('scope')).toContain('gitgazer-mcp/write');
    });

    it('rejects a missing, null or foreign Origin', () => {
        for (const o of [undefined, 'null', 'https://evil.example']) {
            expect(() => ctrl.handleAuthorizeConfirm(origin, o, {request: connectRequest(), session: 'read'})).toThrow(ForbiddenError);
        }
    });

    it('rejects a tampered, expired or missing request, and an unknown session', () => {
        const [payload] = connectRequest().split('.');
        for (const request of [undefined, 'forged.signature', `${payload}.AAAA`]) {
            expect(() => ctrl.handleAuthorizeConfirm(origin, frontendOrigin, {request, session: 'read'})).toThrow(BadRequestError);
        }
        expect(() => confirm('admin')).toThrow(BadRequestError);
        expect(() => ctrl.handleAuthorizeConfirm(origin, frontendOrigin, {request: connectRequest()})).toThrow(BadRequestError);

        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-07-22T00:00:00.000Z'));
            const request = connectRequest();
            vi.setSystemTime(new Date('2026-07-22T00:20:00.000Z'));
            expect(() => ctrl.handleAuthorizeConfirm(origin, frontendOrigin, {request, session: 'read'})).toThrow(BadRequestError);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('handleCallback', () => {
    const confirmed = () => {
        const {location, stateCookie} = confirm('read');
        return {state: new URL(location).searchParams.get('state')!, nonce: nonceOf(stateCookie)};
    };

    it('relays the code and client state when the cookie nonce matches', () => {
        const {state, nonce} = confirmed();
        const url = new URL(ctrl.handleCallback(origin, {state, code: 'AUTH_CODE'}, nonce));
        expect(`${url.origin}${url.pathname}`).toBe('http://127.0.0.1:33418/callback');
        expect(url.searchParams.get('code')).toBe('AUTH_CODE');
        expect(url.searchParams.get('state')).toBe('client-xyz');
        expect(url.searchParams.get('iss')).toBe('https://app.gitgazer.com');
    });

    it('relays OAuth errors back to the client', () => {
        const {state, nonce} = confirmed();
        const url = new URL(ctrl.handleCallback(origin, {state, error: 'access_denied', error_description: 'nope'}, nonce));
        expect(url.searchParams.get('error')).toBe('access_denied');
        expect(url.searchParams.get('error_description')).toBe('nope');
        expect(url.searchParams.get('iss')).toBe('https://app.gitgazer.com');
    });

    it('rejects a missing or different cookie nonce', () => {
        const {state} = confirmed();
        expect(() => ctrl.handleCallback(origin, {state, code: 'x'}, null)).toThrow(/Invalid or expired/);
        expect(() => ctrl.handleCallback(origin, {state, code: 'x'}, 'other-nonce')).toThrow(/Invalid or expired/);
    });

    it('rejects a forged or missing state', () => {
        const {nonce} = confirmed();
        expect(() => ctrl.handleCallback(origin, {state: 'forged.signature', code: 'x'}, nonce)).toThrow(/Invalid or expired/);
        expect(() => ctrl.handleCallback(origin, {code: 'x'}, nonce)).toThrow(/Invalid or expired/);
    });

    it('rejects a connect-request used as state, and a state minted for another purpose', () => {
        const {nonce} = confirmed();
        expect(() => ctrl.handleCallback(origin, {state: connectRequest(), code: 'x'}, nonce)).toThrow(/Invalid or expired/);
        for (const payload of [{purpose: 'slack_install', redirectUri: 'http://127.0.0.1:1/cb'}, {redirect_url: 'https://app.gitgazer.com/'}]) {
            const minted = mintSignedState(payload);
            expect(() => ctrl.handleCallback(origin, {state: minted.token, code: 'x'}, minted.nonce)).toThrow(/Invalid or expired/);
        }
    });

    it('rejects an expired state (past the TTL)', () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-07-22T00:00:00.000Z'));
            const {state, nonce} = confirmed();
            vi.setSystemTime(new Date('2026-07-22T00:20:00.000Z'));
            expect(() => ctrl.handleCallback(origin, {state, code: 'AUTH_CODE'}, nonce)).toThrow(/Invalid or expired/);
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

        const res = await ctrl.handleToken(origin, body);
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
        const res = await ctrl.handleToken(origin, 'grant_type=authorization_code');
        expect(res).toEqual({status: 400, body: '{"error":"invalid_grant"}'});
    });

    it('does not inject a redirect_uri into a refresh grant', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ok: true, status: 200, text: () => Promise.resolve('{}')});
        vi.stubGlobal('fetch', fetchMock);
        await ctrl.handleToken(origin, 'grant_type=refresh_token&refresh_token=RT');
        const sent = new URLSearchParams((fetchMock.mock.calls[0][1] as {body: string}).body);
        expect(sent.get('grant_type')).toBe('refresh_token');
        expect(sent.get('refresh_token')).toBe('RT');
        // refresh grant must NOT get a redirect_uri injected
        expect(sent.get('redirect_uri')).toBeNull();
    });
});
