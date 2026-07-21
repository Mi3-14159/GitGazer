import {buildProtectedResourceMetadata, McpAuthError, protectedResourceMetadataUrl, resolveMcpCaller} from '@/domains/mcp/mcp.controller';
import {handleMcpRequest, type JsonRpcRequest} from '@/domains/mcp/mcp.protocol';
import {getLogger} from '@/shared/logger';
import {AppRequestContext} from '@/shared/types';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

const JSON_HEADERS = {'Content-Type': 'application/json', 'Cache-Control': 'no-store'} as const;

router.post('/api/mcp', async (reqCtx: AppRequestContext) => {
    const logger = getLogger();
    const event = reqCtx.event as APIGatewayProxyEventV2;

    let caller;
    try {
        caller = await resolveMcpCaller(event.headers?.['authorization']);
    } catch (error) {
        if (error instanceof McpAuthError) {
            logger.info('MCP request unauthenticated', {message: error.message});
            return new Response(JSON.stringify({error: 'unauthorized', message: error.message}), {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {...JSON_HEADERS, 'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl(event)}"`},
            });
        }
        throw error;
    }

    let rpc: JsonRpcRequest;
    try {
        rpc = (await reqCtx.req.json()) as JsonRpcRequest;
    } catch {
        return new Response(JSON.stringify({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}}), {
            status: HttpStatusCodes.OK,
            headers: JSON_HEADERS,
        });
    }

    const response = await handleMcpRequest(rpc, caller);
    // Notifications produce no response body.
    if (response === null) {
        return new Response(null, {status: HttpStatusCodes.ACCEPTED});
    }
    return new Response(JSON.stringify(response), {status: HttpStatusCodes.OK, headers: JSON_HEADERS});
});

router.get('/.well-known/oauth-protected-resource', async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    return new Response(JSON.stringify(buildProtectedResourceMetadata(event)), {status: HttpStatusCodes.OK, headers: JSON_HEADERS});
});

export const publicPrefixes = ['/api/mcp', '/.well-known/oauth-protected-resource'] as const;

export default router;
