import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/domains/mcp/mcp.tools', () => ({
    MCP_TOOLS: [{name: 'run_sql', description: 'd', inputSchema: {type: 'object', properties: {}}}],
    runToolCall: vi.fn(),
    McpToolError: class McpToolError extends Error {},
}));
vi.mock('@/shared/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const CALLER = {userId: 1, integrationIds: ['i1']};

let tools: typeof import('@/domains/mcp/mcp.tools');
let mod: typeof import('@/domains/mcp/mcp.protocol');

describe('handleMcpRequest', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        tools = await import('@/domains/mcp/mcp.tools');
        mod = await import('@/domains/mcp/mcp.protocol');
    });

    it('initialize returns the protocol version, capabilities and serverInfo', async () => {
        const r = await mod.handleMcpRequest({jsonrpc: '2.0', id: 1, method: 'initialize'}, CALLER);
        expect(r).toMatchObject({
            jsonrpc: '2.0',
            id: 1,
            result: {protocolVersion: expect.any(String), capabilities: {tools: {}}, serverInfo: {name: 'gitgazer-mcp'}},
        });
    });

    it('ping returns an empty result', async () => {
        const r = await mod.handleMcpRequest({id: 2, method: 'ping'}, CALLER);
        expect(r).toMatchObject({id: 2, result: {}});
    });

    it('tools/list returns the advertised tools with cache hints', async () => {
        const r = await mod.handleMcpRequest({id: 3, method: 'tools/list'}, CALLER);
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
            const r = await mod.handleMcpRequest(req, CALLER);
            expect((r as {result: {resultType: string}}).result.resultType).toBe('complete');
        }
    });

    it('tools/call dispatches to runToolCall with the resolved caller', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({content: [{type: 'text', text: 'ok'}]});
        const r = await mod.handleMcpRequest({id: 4, method: 'tools/call', params: {name: 'run_sql', arguments: {sql: 'SELECT 1'}}}, CALLER);
        expect(tools.runToolCall).toHaveBeenCalledWith('run_sql', {sql: 'SELECT 1'}, CALLER);
        expect((r as {result: {content: {text: string}[]}}).result.content[0].text).toBe('ok');
    });

    it('tools/call echoes a trusted McpToolError message in-band (isError), not as a JSON-RPC error', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new tools.McpToolError('quota exceeded'));
        const r = await mod.handleMcpRequest({id: 5, method: 'tools/call', params: {name: 'run_sql', arguments: {}}}, CALLER);
        expect((r as {result: {isError: boolean; content: {text: string}[]}}).result).toMatchObject({
            isError: true,
            content: [{text: 'quota exceeded'}],
        });
    });

    it('tools/call sanitizes an untrusted (raw DB) error to a generic message', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('permission denied for table gitgazer.users'));
        const r = await mod.handleMcpRequest({id: 5, method: 'tools/call', params: {name: 'run_sql', arguments: {}}}, CALLER);
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
        const r = await mod.handleMcpRequest({id: 8, method: 'tools/call', params: {}}, CALLER);
        expect((r as {error: {code: number}}).error.code).toBe(-32602);
    });

    it('unknown request method → -32601', async () => {
        const r = await mod.handleMcpRequest({id: 6, method: 'foo/bar'}, CALLER);
        expect((r as {error: {code: number}}).error.code).toBe(-32601);
    });

    it('missing method on a request → -32600', async () => {
        const r = await mod.handleMcpRequest({id: 7}, CALLER);
        expect((r as {error: {code: number}}).error.code).toBe(-32600);
    });
});
