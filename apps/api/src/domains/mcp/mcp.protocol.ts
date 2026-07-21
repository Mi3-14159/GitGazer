import {type McpCaller} from '@/domains/mcp/mcp.controller';
import {MCP_TOOLS, runToolCall} from '@/domains/mcp/mcp.tools';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = {name: 'gitgazer-mcp', version: '1.0.0'} as const;

export type JsonRpcId = string | number | null;
export type JsonRpcRequest = {jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown>};
export type JsonRpcResponse = {jsonrpc: '2.0'; id: JsonRpcId; result?: unknown; error?: {code: number; message: string}};

const ok = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({jsonrpc: '2.0', id, result});
const fail = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({jsonrpc: '2.0', id, error: {code, message}});

/**
 * Handle one MCP JSON-RPC message. Returns the response, or `null` for notifications
 * (messages with no `id`, e.g. `notifications/initialized`), which must not be answered.
 *
 * Read-only server: only `initialize`, `ping`, `tools/list` and `tools/call` are supported.
 */
export const handleMcpRequest = async (req: JsonRpcRequest, caller: McpCaller): Promise<JsonRpcResponse | null> => {
    const isNotification = req.id === undefined;
    const id: JsonRpcId = req.id ?? null;
    const method = req.method;
    const params = req.params ?? {};

    if (typeof method !== 'string') {
        return isNotification ? null : fail(id, -32600, 'Invalid Request: missing method');
    }

    switch (method) {
        case 'initialize':
            return ok(id, {protocolVersion: PROTOCOL_VERSION, capabilities: {tools: {}}, serverInfo: SERVER_INFO});
        case 'ping':
            return ok(id, {});
        case 'tools/list':
            return ok(id, {tools: MCP_TOOLS});
        case 'tools/call': {
            const name = params.name;
            const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
            if (typeof name !== 'string') return fail(id, -32602, 'Invalid params: tool name is required');
            try {
                return ok(id, await runToolCall(name, args, caller));
            } catch (error) {
                // Tool failures are reported in-band (MCP convention), not as JSON-RPC errors.
                const message = error instanceof Error ? error.message : 'Tool execution failed';
                return ok(id, {content: [{type: 'text', text: message}], isError: true});
            }
        }
        default:
            // Unknown notifications (e.g. notifications/initialized) are silently accepted.
            return isNotification ? null : fail(id, -32601, `Method not found: ${method}`);
    }
};
