import router from '@/domains/mcp/mcp.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';
import {mintSignedState} from '@/domains/auth/auth.controller';
import config from '@gitgazer/backend-core/config';
import {OAuthError, OAuthErrorCode} from '@modelcontextprotocol/server';
import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {verifyAccessToken, getUserIntegrationRoles, runReadOnlyQuery, deleteNotificationRule} = vi.hoisted(() => ({
    deleteNotificationRule: vi.fn(),
    verifyAccessToken: vi.fn(),
    getUserIntegrationRoles: vi.fn(),
    runReadOnlyQuery: vi.fn(),
}));

vi.mock('@/domains/mcp/mcp.controller', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    mcpTokenVerifier: {verifyAccessToken},
    protectedResourceMetadataUrl: () => 'https://app.example.com/.well-known/oauth-protected-resource',
}));
vi.mock('@/domains/integrations/integrations.controller', () => ({getUserIntegrationRoles}));
vi.mock('@/domains/notifications/notifications.controller', () => ({
    upsertNotificationRule: vi.fn(),
    updateNotificationRule: vi.fn(),
    deleteNotificationRule,
}));
vi.mock('@gitgazer/db/queries', () => ({runReadOnlyQuery, ReadOnlyQueryError: class ReadOnlyQueryError extends Error {}}));
vi.mock('@/domains/mcp/mcp.quota', () => ({
    reserveQueryBudget: vi.fn(),
    chargeQueryBudget: vi.fn(),
    QuotaExceededError: class QuotaExceededError extends Error {},
}));
vi.mock('@/shared/middleware/token-verifier', () => ({getMcpAccessVerifier: () => ({verify: vi.fn()})}));
vi.mock('@gitgazer/backend-core/logger', () => ({
    getLogger: () => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        resetKeys: vi.fn(),
        addContext: vi.fn(),
        logEventIfEnabled: vi.fn(),
    }),
}));
vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/config', async (importOriginal) => ({...(await importOriginal<object>()), loadConfig: vi.fn()}));
vi.mock('@gitgazer/db/client', async (importOriginal) => ({...(await importOriginal<object>()), initDb: vi.fn()}));

const app = new Hono<AppEnv>().route('/api/mcp', router);

const MODERN_VERSION = '2026-07-28';
const ID_A = '11111111-1111-1111-1111-111111111111';

const post = (body: string, headers?: Record<string, string>): Promise<Response> =>
    testRequest(app, 'POST', '/api/mcp', {
        body,
        headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer token', ...headers},
    });

const legacyBody = (method: string, params?: Record<string, unknown>): string => JSON.stringify({jsonrpc: '2.0', id: 1, method, params});

const modernBody = (method: string, params: Record<string, unknown> = {}): string =>
    JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: {
            ...params,
            _meta: {
                'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
                'io.modelcontextprotocol/clientCapabilities': {},
            },
        },
    });

const modernHeaders = (method: string, name?: string): Record<string, string> => ({
    'mcp-protocol-version': MODERN_VERSION,
    'mcp-method': method,
    ...(name === undefined ? {} : {'mcp-name': name}),
});

describe('POST /api/mcp', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        verifyAccessToken.mockResolvedValue({
            token: 'token',
            clientId: 'mcp-client',
            scopes: [],
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            extra: {userId: 7},
        });
        getUserIntegrationRoles.mockResolvedValue({[ID_A]: 'viewer'});
        runReadOnlyQuery.mockResolvedValue({columns: [], rows: [], rowCount: 0, truncated: false});
    });

    it('answers 401 with the resource-metadata challenge when the token is rejected', async () => {
        verifyAccessToken.mockRejectedValue(new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or expired access token'));
        const res = await post(legacyBody('tools/list'));
        expect(res.status).toBe(401);
        expect(res.headers.get('www-authenticate')).toContain('resource_metadata="https://app.example.com/.well-known/oauth-protected-resource"');
    });

    it('answers 500 when token verification fails for a non-auth reason', async () => {
        verifyAccessToken.mockRejectedValue(new Error('db down'));
        expect((await post(legacyBody('tools/list'))).status).toBe(500);
    });

    it('serves a legacy initialize as JSON', async () => {
        const res = await post(legacyBody('initialize', {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 't', version: '1'}}));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        expect((await res.json()).result.serverInfo.name).toBe('gitgazer-mcp');
    });

    it('lists exactly the three read-only tools', async () => {
        const {result} = await (await post(legacyBody('tools/list'))).json();
        expect(result.tools.map((t: {name: string}) => t.name)).toEqual(['run_sql', 'list_tables', 'describe_table']);
        expect(result.tools.every((t: {annotations?: {readOnlyHint?: boolean}}) => t.annotations?.readOnlyHint)).toBe(true);
    });

    it('lists six tools for a write-scope token', async () => {
        verifyAccessToken.mockResolvedValue({...(await verifyAccessToken()), scopes: ['gitgazer-mcp/read', 'gitgazer-mcp/write']});
        const {result} = await (await post(legacyBody('tools/list'))).json();
        expect(result.tools.map((t: {name: string}) => t.name)).toEqual([
            'run_sql',
            'list_tables',
            'describe_table',
            'create_notification_rule',
            'update_notification_rule',
            'delete_notification_rule',
        ]);
    });

    it('lists three tools for a read token', async () => {
        verifyAccessToken.mockResolvedValue({...(await verifyAccessToken()), scopes: ['gitgazer-mcp/read']});
        const {result} = await (await post(legacyBody('tools/list'))).json();
        expect(result.tools).toHaveLength(3);
    });

    it('rejects delete_notification_rule for a read token without calling the controller', async () => {
        const res = await post(
            modernBody('tools/call', {name: 'delete_notification_rule', arguments: {integration_id: ID_A, rule_id: ID_A}}),
            modernHeaders('tools/call', 'delete_notification_rule'),
        );
        expect(JSON.stringify(await res.json())).toMatch(/error/i);
        expect(deleteNotificationRule).not.toHaveBeenCalled();
    });

    it('runs a legacy tools/call without a prior initialize, with the caller role map', async () => {
        getUserIntegrationRoles.mockResolvedValue({[ID_A]: 'admin'});
        const res = await post(legacyBody('tools/call', {name: 'list_tables', arguments: {}}));
        expect(res.status).toBe(200);
        expect(getUserIntegrationRoles).toHaveBeenCalledWith(7);
        expect(runReadOnlyQuery).toHaveBeenCalledWith(expect.objectContaining({integrationRoles: {[ID_A]: 'admin'}}));
    });

    it('serves a 2026-07-28 server/discover as JSON with the instructions', async () => {
        const res = await post(modernBody('server/discover'), modernHeaders('server/discover'));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        expect((await res.json()).result.instructions).toContain('run_sql');
    });

    it('serves a 2026-07-28 tools/call as JSON', async () => {
        const res = await post(modernBody('tools/call', {name: 'list_tables', arguments: {}}), modernHeaders('tools/call', 'list_tables'));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        expect((await res.json()).result.isError).toBeUndefined();
        expect(runReadOnlyQuery).toHaveBeenCalledWith(expect.objectContaining({integrationRoles: {[ID_A]: 'viewer'}}));
    });

    it('finishes a 2026-07-28 subscriptions/listen instead of holding the stream open', async () => {
        const res = await post(modernBody('subscriptions/listen', {notifications: {toolsListChanged: true}}), modernHeaders('subscriptions/listen'));
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain('"notifications":{}');
        expect(body).toContain('"resultType":"complete"');
    });
});

describe('MCP OAuth connect flow', () => {
    const configValues: Record<string, unknown> = {
        mcpServerUrl: 'https://app.example.com/api/mcp',
        stateSecret: 'test-state-secret-0123456789',
        cognito: {domain: 'auth.example.com', mcpClientId: 'mcp-client-123'},
        allowedFrontendOrigins: ['https://app.example.com'],
        mcpAllowedRedirectHosts: [],
    };
    const authorizeQuery = new URLSearchParams({
        response_type: 'code',
        redirect_uri: 'http://127.0.0.1:33418/callback',
        code_challenge: 'CHALLENGE',
        code_challenge_method: 'S256',
    });

    beforeEach(() => {
        vi.spyOn(config, 'get').mockImplementation(((key: string) => configValues[key]) as typeof config.get);
    });

    const connectRequest = async (): Promise<string> => {
        const res = await testRequest(app, 'GET', `/api/mcp/oauth/authorize?${authorizeQuery}`);
        return new URL(res.headers.get('location')!).searchParams.get('request')!;
    };

    const confirm = async (session: string) =>
        testRequest(app, 'POST', '/api/mcp/oauth/authorize', {
            headers: {'content-type': 'application/x-www-form-urlencoded', origin: 'https://app.example.com'},
            body: new URLSearchParams({request: await connectRequest(), session}).toString(),
        });

    it('sends GET authorize to the connect page', async () => {
        const res = await testRequest(app, 'GET', `/api/mcp/oauth/authorize?${authorizeQuery}`);
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toMatch(/^https:\/\/app\.example\.com\/mcp\/connect\?request=/);
    });

    it('answers POST authorize with a 303 to Cognito and the state cookie', async () => {
        const res = await confirm('read');
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toMatch(/^https:\/\/auth\.example\.com\/oauth2\/authorize\?/);
        expect(res.headers.getSetCookie()[0]).toMatch(/^oauthState=/);
    });

    it('rejects POST authorize from a foreign origin', async () => {
        const res = await testRequest(app, 'POST', '/api/mcp/oauth/authorize', {
            headers: {'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example'},
            body: new URLSearchParams({request: await connectRequest(), session: 'write'}).toString(),
        });
        expect(res.status).toBe(403);
    });

    it('rejects the callback without the state cookie and relays with it', async () => {
        const bound = mintSignedState({purpose: 'mcp_authorize', redirectUri: 'http://127.0.0.1:33418/callback', write: false});

        const missing = await testRequest(app, 'GET', `/api/mcp/oauth/callback?code=c&state=${bound.token}`);
        expect(missing.status).toBe(400);

        const ok = await testRequest(app, 'GET', `/api/mcp/oauth/callback?code=c&state=${bound.token}`, {cookies: [`oauthState=${bound.nonce}`]});
        expect(ok.status).toBe(302);
        expect(ok.headers.get('location')).toContain('http://127.0.0.1:33418/callback');
        expect(ok.headers.getSetCookie()[0]).toMatch(/oauthState=;.*Max-Age=0/);
    });
});
