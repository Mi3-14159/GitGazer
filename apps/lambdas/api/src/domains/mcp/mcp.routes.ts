import {buildAuthServerMetadata, handleAuthorize, handleCallback, handleRegister, handleToken} from '@/domains/mcp/mcp-oauth.controller';
import {buildProtectedResourceMetadata, McpAuthError, protectedResourceMetadataUrl, resolveMcpCaller} from '@/domains/mcp/mcp.controller';
import {handleMcpRequest, type JsonRpcRequest} from '@/domains/mcp/mcp.protocol';
import type {AppEnv} from '@/shared/hono/env';
import {HttpStatusCodes} from '@/shared/errors';
import {getLogger} from '@gitgazer/backend-core/logger';
import type {Context} from 'hono';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

const requestOrigin = (c: Context<AppEnv>): string => `https://${new URL(c.req.url).host}`;

const JSON_HEADERS = {'Content-Type': 'application/json', 'Cache-Control': 'no-store'} as const;

const jsonRpcError = (code: number, message: string, status: number): Response =>
    new Response(JSON.stringify({jsonrpc: '2.0', id: null, error: {code, message}}), {status, headers: JSON_HEADERS});

router.post('/mcp', async (c) => {
    const logger = getLogger();
    const headers = c.req.header();

    let caller;
    try {
        caller = await resolveMcpCaller(headers['authorization']);
    } catch (error) {
        if (error instanceof McpAuthError) {
            logger.info('MCP request unauthenticated', {message: error.message});
            return new Response(JSON.stringify({error: 'unauthorized', message: error.message}), {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {...JSON_HEADERS, 'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl(requestOrigin(c))}"`},
            });
        }
        throw error;
    }

    let rpc: unknown;
    try {
        rpc = await c.req.json();
    } catch {
        return jsonRpcError(-32700, 'Parse error', HttpStatusCodes.OK);
    }
    // A JSON-RPC batch (array) or a bare scalar parses cleanly but is not a request object.
    if (typeof rpc !== 'object' || rpc === null || Array.isArray(rpc)) {
        return jsonRpcError(-32600, 'Invalid Request: expected a single JSON-RPC object', HttpStatusCodes.BAD_REQUEST);
    }

    const outcome = await handleMcpRequest(rpc as JsonRpcRequest, caller, headers);
    if (outcome === null) {
        return new Response(null, {status: HttpStatusCodes.ACCEPTED});
    }
    return new Response(JSON.stringify(outcome.response), {status: outcome.status, headers: JSON_HEADERS});
});

// Served outside /api, where MCP clients look for them.
export const wellKnownRoutes = new Hono<AppEnv>();

wellKnownRoutes.get('/.well-known/oauth-protected-resource', async (c) => {
    return new Response(JSON.stringify(buildProtectedResourceMetadata(requestOrigin(c))), {status: HttpStatusCodes.OK, headers: JSON_HEADERS});
});

// --- OAuth 2.0 authorization-server proxy (fronts Cognito so MCP clients need no manual setup) ---

wellKnownRoutes.get('/.well-known/oauth-authorization-server', async (c) => {
    return new Response(JSON.stringify(buildAuthServerMetadata(requestOrigin(c))), {status: HttpStatusCodes.OK, headers: JSON_HEADERS});
});

router.post('/mcp/oauth/register', async (c) => {
    return new Response(JSON.stringify(handleRegister(await c.req.text())), {
        status: HttpStatusCodes.CREATED,
        headers: JSON_HEADERS,
    });
});

router.get('/mcp/oauth/authorize', async (c) => {
    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: {Location: handleAuthorize(requestOrigin(c), c.req.query()), 'Cache-Control': 'no-store'},
    });
});

router.get('/mcp/oauth/callback', async (c) => {
    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: {Location: handleCallback(requestOrigin(c), c.req.query()), 'Cache-Control': 'no-store'},
    });
});

router.post('/mcp/oauth/token', async (c) => {
    const {status, body} = await handleToken(requestOrigin(c), await c.req.text());
    return new Response(body, {status, headers: JSON_HEADERS});
});

export const publicPrefixes = ['/api/mcp', '/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server'] as const;

export default router;
