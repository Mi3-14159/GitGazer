import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/domains/mcp/mcp.tools', () => ({
    MCP_TOOLS: [{name: 'run_sql', description: 'd', inputSchema: {type: 'object', properties: {}}}],
    runToolCall: vi.fn(),
    McpToolError: class McpToolError extends Error {},
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const CALLER = {userId: 1, integrationIds: ['i1']};
const MODERN_VERSION = '2026-07-28';

let tools: typeof import('@/domains/mcp/mcp.tools');
let mod: typeof import('@/domains/mcp/mcp.protocol');

type Req = Parameters<typeof mod.handleMcpRequest>[0];

/** Send a request and unwrap the JSON-RPC message, dropping the HTTP status. */
const send = async (req: Req, headers?: Record<string, string>): Promise<unknown> =>
    (await mod.handleMcpRequest(req, CALLER, headers))?.response ?? null;

const modernParams = (params: Record<string, unknown> = {}, version = MODERN_VERSION): Record<string, unknown> => ({
    ...params,
    _meta: {'io.modelcontextprotocol/protocolVersion': version},
});

const modernHeaders = (method: string, name?: string, version = MODERN_VERSION): Record<string, string> => ({
    'mcp-protocol-version': version,
    'mcp-method': method,
    ...(name === undefined ? {} : {'mcp-name': name}),
});

describe('handleMcpRequest', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        tools = await import('@/domains/mcp/mcp.tools');
        mod = await import('@/domains/mcp/mcp.protocol');
    });

    it('initialize returns the protocol version, capabilities and serverInfo', async () => {
        const r = await send({jsonrpc: '2.0', id: 1, method: 'initialize'});
        expect(r).toMatchObject({
            jsonrpc: '2.0',
            id: 1,
            result: {protocolVersion: expect.any(String), capabilities: {tools: {}}, serverInfo: {name: 'gitgazer-mcp'}},
        });
    });

    it('ping returns an empty result', async () => {
        const r = await send({id: 2, method: 'ping'});
        expect(r).toMatchObject({id: 2, result: {}});
    });

    it('tools/list returns the advertised tools with cache hints', async () => {
        const r = await send({id: 3, method: 'tools/list'});
        const result = (r as {result: {tools: unknown[]; ttlMs: number; cacheScope: string}}).result;
        expect(result.tools).toHaveLength(1);
        expect(result.ttlMs).toBeGreaterThan(0);
        expect(result.cacheScope).toBe('private');
    });

    it('every result carries resultType "complete"', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({content: []});
        const requests = [
            {id: 1, method: 'initialize'},
            {id: 2, method: 'ping'},
            {id: 3, method: 'tools/list'},
            {id: 4, method: 'tools/call', params: {name: 'run_sql', arguments: {}}},
        ];
        for (const req of requests) {
            const r = await send(req);
            expect((r as {result: {resultType: string}}).result.resultType).toBe('complete');
        }
    });

    it('tools/call dispatches to runToolCall with the resolved caller', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({content: [{type: 'text', text: 'ok'}]});
        const r = await send({id: 4, method: 'tools/call', params: {name: 'run_sql', arguments: {sql: 'SELECT 1'}}});
        expect(tools.runToolCall).toHaveBeenCalledWith('run_sql', {sql: 'SELECT 1'}, CALLER);
        expect((r as {result: {content: {text: string}[]}}).result.content[0].text).toBe('ok');
    });

    it('tools/call echoes a trusted McpToolError message in-band (isError), not as a JSON-RPC error', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new tools.McpToolError('quota exceeded'));
        const r = await send({id: 5, method: 'tools/call', params: {name: 'run_sql', arguments: {}}});
        expect((r as {result: {isError: boolean; content: {text: string}[]}}).result).toMatchObject({
            isError: true,
            content: [{text: 'quota exceeded'}],
        });
    });

    it('tools/call sanitizes an untrusted (raw DB) error to a generic message', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('permission denied for table gitgazer.users'));
        const r = await send({id: 5, method: 'tools/call', params: {name: 'run_sql', arguments: {}}});
        const result = (r as {result: {isError: boolean; content: {text: string}[]}}).result;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Tool execution failed');
        expect(result.content[0].text).not.toContain('permission denied');
    });

    it('returns null for a notification (no id)', async () => {
        expect(await mod.handleMcpRequest({method: 'notifications/initialized'}, CALLER)).toBeNull();
    });

    it('does not execute or answer a notification for a request method (no id)', async () => {
        const r = await mod.handleMcpRequest({method: 'tools/call', params: {name: 'run_sql', arguments: {}}}, CALLER);
        expect(r).toBeNull();
        expect(tools.runToolCall).not.toHaveBeenCalled();
    });

    it('tools/call with a non-string name → -32602', async () => {
        const r = await send({id: 8, method: 'tools/call', params: {}});
        expect((r as {error: {code: number}}).error.code).toBe(-32602);
    });

    it('unknown request method → -32601', async () => {
        const r = await send({id: 6, method: 'foo/bar'});
        expect((r as {error: {code: number}}).error.code).toBe(-32601);
    });

    it('missing method on a request → -32600', async () => {
        const r = await send({id: 7});
        expect((r as {error: {code: number}}).error.code).toBe(-32600);
    });

    it('legacy requests answer every error with HTTP 200', async () => {
        const unknownMethod = await mod.handleMcpRequest({id: 9, method: 'foo/bar'}, CALLER);
        expect(unknownMethod?.status).toBe(200);

        const badParams = await mod.handleMcpRequest({id: 10, method: 'tools/call', params: {}}, CALLER);
        expect(badParams?.status).toBe(200);
    });
});

describe('handleMcpRequest — protocol 2026-07-28', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        tools = await import('@/domains/mcp/mcp.tools');
        mod = await import('@/domains/mcp/mcp.protocol');
    });

    it('server/discover advertises supported versions, capabilities, instructions and serverInfo', async () => {
        const r = await mod.handleMcpRequest({id: 1, method: 'server/discover', params: modernParams()}, CALLER, modernHeaders('server/discover'));
        expect(r?.status).toBe(200);
        expect(r?.response.result).toMatchObject({
            resultType: 'complete',
            supportedVersions: ['2026-07-28', '2025-11-25'],
            capabilities: {tools: {}},
            instructions: expect.stringContaining('integration_id'),
            cacheScope: 'private',
            _meta: {'io.modelcontextprotocol/serverInfo': {name: 'gitgazer-mcp'}},
        });
    });

    it('server/discover is answered for legacy clients too, so identity is always reachable', async () => {
        const r = await mod.handleMcpRequest({id: 1, method: 'server/discover'}, CALLER);
        expect((r?.response.result as {_meta: Record<string, unknown>})._meta).toMatchObject({
            'io.modelcontextprotocol/serverInfo': {name: 'gitgazer-mcp'},
        });
    });

    it('every result carries serverInfo in _meta, in both eras', async () => {
        const modern = await mod.handleMcpRequest({id: 2, method: 'tools/list', params: modernParams()}, CALLER, modernHeaders('tools/list'));
        const legacy = await mod.handleMcpRequest({id: 3, method: 'tools/list'}, CALLER);
        for (const r of [modern, legacy]) {
            expect((r?.response.result as {_meta: Record<string, unknown>})._meta).toMatchObject({
                'io.modelcontextprotocol/serverInfo': {name: 'gitgazer-mcp'},
            });
        }
    });

    it('an unsupported protocol version → 400 and -32022 listing the supported versions', async () => {
        const params = modernParams({}, '1900-01-01');
        const r = await mod.handleMcpRequest({id: 3, method: 'tools/list', params}, CALLER, modernHeaders('tools/list', undefined, '1900-01-01'));
        expect(r?.status).toBe(400);
        expect(r?.response.error).toMatchObject({code: -32022, data: {supported: ['2026-07-28', '2025-11-25'], requested: '1900-01-01'}});
    });

    it('a missing required header → 400 and -32020', async () => {
        const r = await mod.handleMcpRequest({id: 4, method: 'tools/list', params: modernParams()}, CALLER, {'mcp-protocol-version': MODERN_VERSION});
        expect(r?.status).toBe(400);
        expect(r?.response.error?.code).toBe(-32020);
    });

    it('an Mcp-Name header that disagrees with the body → 400 and -32020, without running the tool', async () => {
        const params = modernParams({name: 'run_sql', arguments: {}});
        const r = await mod.handleMcpRequest({id: 5, method: 'tools/call', params}, CALLER, modernHeaders('tools/call', 'list_tables'));
        expect(r?.status).toBe(400);
        expect(r?.response.error?.code).toBe(-32020);
        expect(tools.runToolCall).not.toHaveBeenCalled();
    });

    it('accepts a base64-encoded Mcp-Name', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({content: []});
        const encoded = `=?base64?${Buffer.from('run_sql', 'utf-8').toString('base64')}?=`;
        const params = modernParams({name: 'run_sql', arguments: {}});
        const r = await mod.handleMcpRequest({id: 6, method: 'tools/call', params}, CALLER, modernHeaders('tools/call', encoded));
        expect(r?.status).toBe(200);
        expect(tools.runToolCall).toHaveBeenCalled();
    });

    it.each(['initialize', 'ping', 'foo/bar'])('%s is not available to modern clients → 404 and -32601', async (method) => {
        const r = await mod.handleMcpRequest({id: 7, method, params: modernParams()}, CALLER, modernHeaders(method));
        expect(r?.status).toBe(404);
        expect(r?.response.error?.code).toBe(-32601);
    });
});
