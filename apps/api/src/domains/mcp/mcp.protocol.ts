import {type McpCaller} from '@/domains/mcp/mcp.controller';
import {MCP_TOOLS, McpToolError, runToolCall} from '@/domains/mcp/mcp.tools';
import {getLogger} from '@/shared/logger';
import {ReadOnlyQueryError} from '@gitgazer/db/queries';

const PROTOCOL_VERSION = '2025-11-25';
const SERVER_INFO = {name: 'gitgazer-mcp', version: '1.0.0'} as const;
const TOOLS_LIST_TTL_MS = 1000 * 60 * 10;

export type JsonRpcId = string | number | null;
export type JsonRpcRequest = {jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown>};
export type JsonRpcResponse = {jsonrpc: '2.0'; id: JsonRpcId; result?: unknown; error?: {code: number; message: string}};

// `resultType` is required from protocol 2026-07-28 onward; earlier clients ignore the extra field.
const ok = (id: JsonRpcId, result: Record<string, unknown>): JsonRpcResponse => ({jsonrpc: '2.0', id, result: {resultType: 'complete', ...result}});
const fail = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({jsonrpc: '2.0', id, error: {code, message}});

/**
 * Handle one MCP JSON-RPC message. Returns the response, or `null` for notifications
 * (messages with no `id`, e.g. `notifications/initialized`), which must not be answered.
 *
 * Read-only server: only `initialize`, `ping`, `tools/list` and `tools/call` are supported.
 */
export const handleMcpRequest = async (req: JsonRpcRequest, caller: McpCaller): Promise<JsonRpcResponse | null> => {
    // JSON-RPC notifications (no `id`) are fire-and-forget: never execute a request method or reply.
    if (req.id === undefined) {
        return null;
    }
    const id: JsonRpcId = req.id;
    const method = req.method;
    const params = req.params ?? {};

    if (req.jsonrpc !== undefined && req.jsonrpc !== '2.0') {
        return fail(id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
    }
    if (typeof method !== 'string') {
        return fail(id, -32600, 'Invalid Request: missing method');
    }

    switch (method) {
        case 'initialize':
            return ok(id, {protocolVersion: PROTOCOL_VERSION, capabilities: {tools: {}}, serverInfo: SERVER_INFO});
        case 'ping':
            return ok(id, {});
        case 'tools/list':
            return ok(id, {tools: MCP_TOOLS, ttlMs: TOOLS_LIST_TTL_MS, cacheScope: 'private'});
        case 'tools/call': {
            const name = params.name;
            const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
            if (typeof name !== 'string') return fail(id, -32602, 'Invalid params: tool name is required');
            try {
                return ok(id, await runToolCall(name, args, caller));
            } catch (error) {
                // Tool failures are reported in-band (MCP convention), not as JSON-RPC errors.
                // Only echo messages from trusted error types; anything else (raw DB/Postgres
                // errors) is logged server-side and returned generically so schema/role internals
                // don't leak to the client.
                const safe = error instanceof McpToolError || error instanceof ReadOnlyQueryError;
                if (!safe) {
                    getLogger().error('MCP tool call failed', {tool: name, error});
                }
                const message = safe && error instanceof Error ? error.message : 'Tool execution failed';
                return ok(id, {content: [{type: 'text', text: message}], isError: true});
            }
        }
        default:
            return fail(id, -32601, `Method not found: ${method}`);
    }
};
