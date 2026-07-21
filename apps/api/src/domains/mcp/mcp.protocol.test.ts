import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/domains/mcp/mcp.tools', () => ({
    MCP_TOOLS: [{name: 'run_sql', description: 'd', inputSchema: {type: 'object', properties: {}}}],
    runToolCall: vi.fn(),
}));

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

    it('tools/list returns the advertised tools', async () => {
        const r = await mod.handleMcpRequest({id: 3, method: 'tools/list'}, CALLER);
        expect((r as {result: {tools: unknown[]}}).result.tools).toHaveLength(1);
    });

    it('tools/call dispatches to runToolCall with the resolved caller', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({content: [{type: 'text', text: 'ok'}]});
        const r = await mod.handleMcpRequest({id: 4, method: 'tools/call', params: {name: 'run_sql', arguments: {sql: 'SELECT 1'}}}, CALLER);
        expect(tools.runToolCall).toHaveBeenCalledWith('run_sql', {sql: 'SELECT 1'}, CALLER);
        expect((r as {result: {content: {text: string}[]}}).result.content[0].text).toBe('ok');
    });

    it('tools/call reports a tool failure in-band (isError), not as a JSON-RPC error', async () => {
        (tools.runToolCall as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
        const r = await mod.handleMcpRequest({id: 5, method: 'tools/call', params: {name: 'run_sql', arguments: {}}}, CALLER);
        expect((r as {result: {isError: boolean; content: {text: string}[]}}).result).toMatchObject({isError: true, content: [{text: 'boom'}]});
    });

    it('returns null for a notification (no id)', async () => {
        expect(await mod.handleMcpRequest({method: 'notifications/initialized'}, CALLER)).toBeNull();
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
