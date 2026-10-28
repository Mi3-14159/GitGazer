import router from '@/domains/mcp/mcp.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';
import {OAuthError, OAuthErrorCode} from '@modelcontextprotocol/server';
import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {verifyAccessToken, getUserIntegrationRoles, runReadOnlyQuery} = vi.hoisted(() => ({
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
