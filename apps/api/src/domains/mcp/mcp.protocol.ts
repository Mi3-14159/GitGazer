import {type McpCaller} from '@/domains/mcp/mcp.controller';
import {validateMcpHeaders} from '@/domains/mcp/mcp.headers';
import {MCP_TOOLS, McpToolError, runToolCall} from '@/domains/mcp/mcp.tools';
import {getLogger} from '@/shared/logger';
import {HttpStatusCodes} from '@aws-lambda-powertools/event-handler/http';
import {ReadOnlyQueryError} from '@gitgazer/db/queries';

const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSION = '2025-11-25';
const SUPPORTED_VERSIONS = [MODERN_VERSION, LEGACY_VERSION] as const;
const SERVER_INFO = {name: 'gitgazer-mcp', version: '1.0.0'} as const;
const CACHE_TTL_MS = 1000 * 60 * 10;

const META_PROTOCOL_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

const METHOD_NOT_FOUND = -32601;
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_PROTOCOL_VERSION = -32022;

const INSTRUCTIONS = [
    'Query your GitHub Actions and pull-request data with run_sql (a single read-only SELECT or WITH).',
    'Every table lives in the "github" schema, and "user" is a reserved word that must be double-quoted.',
    'Rows are multi-tenant and ids are only unique per integration, so every join must match on integration_id as well as the id column.',
].join(' ');

export type JsonRpcId = string | number | null;
export type JsonRpcRequest = {jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown>};
export type JsonRpcResponse = {jsonrpc: '2.0'; id: JsonRpcId; result?: unknown; error?: {code: number; message: string; data?: unknown}};
/** A JSON-RPC message plus the HTTP status the Streamable HTTP transport requires for it. */
export type McpOutcome = {status: number; response: JsonRpcResponse};

/**
 * `modern` = protocol 2026-07-28+, which is stateless and declares its version in `_meta` on
 * every request. `legacy` = 2025-11-25 and earlier, which negotiate once via `initialize`.
 */
type Era = 'modern' | 'legacy';

const readProtocolVersion = (params: Record<string, unknown>): string | undefined => {
    const meta = params._meta;
    if (typeof meta !== 'object' || meta === null) return undefined;
    const version = (meta as Record<string, unknown>)[META_PROTOCOL_VERSION];
    return typeof version === 'string' ? version : undefined;
};

// Legacy clients expect 200 for every JSON-RPC message; modern clients drive retries and
// era-detection fallback off the HTTP status, so errors must carry a matching one.
const errorStatus = (code: number, era: Era): number => {
    if (era === 'legacy') return HttpStatusCodes.OK;
    if (code === METHOD_NOT_FOUND) return HttpStatusCodes.NOT_FOUND;
    if (code === HEADER_MISMATCH || code === UNSUPPORTED_PROTOCOL_VERSION) return HttpStatusCodes.BAD_REQUEST;
    return HttpStatusCodes.OK;
};

// `resultType` is required from protocol 2026-07-28 onward; earlier clients ignore the extra fields.
const ok = (id: JsonRpcId, result: Record<string, unknown>): McpOutcome => ({
    status: HttpStatusCodes.OK,
    response: {jsonrpc: '2.0', id, result: {resultType: 'complete', _meta: {[META_SERVER_INFO]: SERVER_INFO}, ...result}},
});

const fail = (id: JsonRpcId, code: number, message: string, era: Era, data?: unknown): McpOutcome => ({
    status: errorStatus(code, era),
    response: {jsonrpc: '2.0', id, error: {code, message, ...(data === undefined ? {} : {data})}},
});

const methodNotFound = (id: JsonRpcId, method: string, era: Era): McpOutcome => fail(id, METHOD_NOT_FOUND, `Method not found: ${method}`, era);

/**
 * Handle one MCP JSON-RPC message. Returns the response and its HTTP status, or `null` for
 * notifications (messages with no `id`, e.g. `notifications/initialized`), which must not
 * be answered.
 *
 * Dual-era read-only server: modern clients get `server/discover`, `tools/list` and
 * `tools/call`; legacy clients additionally get `initialize` and `ping`, which 2026-07-28
 * removed.
 */
export const handleMcpRequest = async (
    req: JsonRpcRequest,
    caller: McpCaller,
    headers: Record<string, string | undefined> = {},
): Promise<McpOutcome | null> => {
    // JSON-RPC notifications (no `id`) are fire-and-forget: never execute a request method or reply.
    if (req.id === undefined) {
        return null;
    }
    const id: JsonRpcId = req.id;
    const method = req.method;
    const params = req.params ?? {};
    const requestedVersion = readProtocolVersion(params);
    const era: Era = requestedVersion === undefined ? 'legacy' : 'modern';

    if (req.jsonrpc !== undefined && req.jsonrpc !== '2.0') {
        return fail(id, -32600, 'Invalid Request: jsonrpc must be "2.0"', era);
    }
    if (typeof method !== 'string') {
        return fail(id, -32600, 'Invalid Request: missing method', era);
    }

    if (era === 'modern') {
        // `2025-11-25` stays in `supported` because it is still served — via the `initialize`
        // handshake, not via this per-request envelope.
        if (requestedVersion !== MODERN_VERSION) {
            const data = {supported: SUPPORTED_VERSIONS, requested: requestedVersion};
            return fail(id, UNSUPPORTED_PROTOCOL_VERSION, 'Unsupported protocol version', era, data);
        }
        const mismatch = validateMcpHeaders(headers, method, params, requestedVersion);
        if (mismatch !== null) {
            return fail(id, HEADER_MISMATCH, mismatch, era);
        }
    }

    switch (method) {
        case 'server/discover':
            return ok(id, {
                supportedVersions: SUPPORTED_VERSIONS,
                capabilities: {tools: {}},
                instructions: INSTRUCTIONS,
                ttlMs: CACHE_TTL_MS,
                cacheScope: 'private',
            });
        // `initialize` and `ping` were removed in 2026-07-28 and are served to legacy clients only.
        case 'initialize':
            if (era === 'modern') return methodNotFound(id, method, era);
            return ok(id, {protocolVersion: LEGACY_VERSION, capabilities: {tools: {}}, serverInfo: SERVER_INFO});
        case 'ping':
            if (era === 'modern') return methodNotFound(id, method, era);
            return ok(id, {});
        case 'tools/list':
            return ok(id, {tools: MCP_TOOLS, ttlMs: CACHE_TTL_MS, cacheScope: 'private'});
        case 'tools/call': {
            const name = params.name;
            const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
            if (typeof name !== 'string') return fail(id, -32602, 'Invalid params: tool name is required', era);
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
            return methodNotFound(id, method, era);
    }
};
