import router from '@/domains/mcp/mcp.routes';
import {testRequest} from '@/shared/hono/test-request';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/domains/mcp/mcp.controller', () => ({
    resolveMcpCaller: vi.fn(),
    McpAuthError: class McpAuthError extends Error {},
    protectedResourceMetadataUrl: () => 'https://app.example.com/.well-known/oauth-protected-resource',
    buildProtectedResourceMetadata: () => ({}),
    mcpOrigin: () => 'https://app.example.com',
}));
vi.mock('@/domains/mcp/mcp-oauth.controller', () => ({
    buildAuthServerMetadata: vi.fn(),
    handleAuthorize: vi.fn(),
    handleCallback: vi.fn(),
    handleRegister: vi.fn(),
    handleToken: vi.fn(),
}));
vi.mock('@/domains/mcp/mcp.tools', () => ({
    MCP_TOOLS: [{name: 'run_sql', description: 'd', inputSchema: {type: 'object', properties: {}}}],
    runToolCall: vi.fn(),
    McpToolError: class McpToolError extends Error {},
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const MODERN_VERSION = '2026-07-28';

let controller: typeof import('@/domains/mcp/mcp.controller');

const post = (body: string, headers?: Record<string, string>): Promise<Response> =>
    testRequest(router, 'POST', '/api/mcp', {body, headers: {'content-type': 'application/json', authorization: 'Bearer token', ...headers}});

const modernBody = (method: string, params: Record<string, unknown> = {}): string =>
    JSON.stringify({jsonrpc: '2.0', id: 1, method, params: {...params, _meta: {'io.modelcontextprotocol/protocolVersion': MODERN_VERSION}}});

const modernHeaders = (method: string, name?: string): Record<string, string> => ({
    'mcp-protocol-version': MODERN_VERSION,
    'mcp-method': method,
    ...(name === undefined ? {} : {'mcp-name': name}),
});

describe('POST /api/mcp', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        controller = await import('@/domains/mcp/mcp.controller');
        (controller.resolveMcpCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({userId: 1, integrationIds: ['i1']});
    });

    it('forwards request headers so modern header validation is actually enforced', async () => {
        const body = modernBody('tools/call', {name: 'run_sql', arguments: {}});
        const res = await post(body, modernHeaders('tools/call', 'list_tables'));
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe(-32020);
    });

    it('maps the protocol outcome status onto the HTTP response', async () => {
        const list = await post(modernBody('tools/list'), modernHeaders('tools/list'));
        expect(list.status).toBe(200);

        const unknown = await post(modernBody('foo/bar'), modernHeaders('foo/bar'));
        expect(unknown.status).toBe(404);
        expect((await unknown.json()).error.code).toBe(-32601);
    });

    it('answers a legacy request with 200', async () => {
        const res = await post(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}));
        expect(res.status).toBe(200);
        expect((await res.json()).result.tools).toHaveLength(1);
    });

    it('rejects a body that is valid JSON but not a request object', async () => {
        for (const body of ['null', '42', '[{"jsonrpc":"2.0","id":1,"method":"tools/list"}]']) {
            const res = await post(body);
            expect(res.status).toBe(400);
            expect((await res.json()).error.code).toBe(-32600);
        }
    });

    it('returns a parse error for an unparseable body', async () => {
        const res = await post('not json');
        expect((await res.json()).error.code).toBe(-32700);
    });

    it('answers a notification with 202', async () => {
        const res = await post(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}));
        expect(res.status).toBe(202);
    });

    it('challenges an unauthenticated caller', async () => {
        const error = new controller.McpAuthError('Missing Authorization: Bearer token');
        (controller.resolveMcpCaller as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(error);
        const res = await post(modernBody('tools/list'), modernHeaders('tools/list'));
        expect(res.status).toBe(401);
        expect(res.headers.get('www-authenticate')).toContain('resource_metadata=');
    });
});
