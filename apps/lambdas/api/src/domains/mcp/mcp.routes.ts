import {buildAuthServerMetadata, handleAuthorize, handleCallback, handleRegister, handleToken} from '@/domains/mcp/mcp-oauth.controller';
import {buildProtectedResourceMetadata, mcpTokenVerifier, protectedResourceMetadataUrl} from '@/domains/mcp/mcp.controller';
import {createMcpServer} from '@/domains/mcp/mcp.server';
import type {AppEnv} from '@/shared/hono/env';
import {HttpStatusCodes} from '@/shared/errors';
import {getLogger} from '@gitgazer/backend-core/logger';
import {createMcpHandler, isLegacyRequest, requireBearerAuth, WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/server';
import type {Context} from 'hono';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

const requestOrigin = (c: Context<AppEnv>): string => `https://${new URL(c.req.url).host}`;

const JSON_HEADERS = {'Content-Type': 'application/json', 'Cache-Control': 'no-store'} as const;

const modernHandler = createMcpHandler(() => createMcpServer(), {legacy: 'reject', responseMode: 'json'});

router.post('/', async (c) => {
    const request = c.req.raw;
    const auth = await requireBearerAuth({verifier: mcpTokenVerifier, resourceMetadataUrl: protectedResourceMetadataUrl(requestOrigin(c))})(request);
    if (auth instanceof Response) {
        // A verifier failure that is not an OAuthError (e.g. the user lookup) surfaces here as a 500.
        if (auth.status >= 500) getLogger().error('MCP token verification failed', {status: auth.status});
        else getLogger().info('MCP request unauthenticated', {status: auth.status});
        return auth;
    }

    if (await isLegacyRequest(request)) {
        const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
        await createMcpServer().connect(transport);
        return transport.handleRequest(request, {authInfo: auth});
    }
    return modernHandler.fetch(request, {authInfo: auth});
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

router.post('/oauth/register', async (c) => {
    return new Response(JSON.stringify(handleRegister(await c.req.text())), {
        status: HttpStatusCodes.CREATED,
        headers: JSON_HEADERS,
    });
});

router.get('/oauth/authorize', async (c) => {
    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: {Location: handleAuthorize(requestOrigin(c), c.req.query()), 'Cache-Control': 'no-store'},
    });
});

router.get('/oauth/callback', async (c) => {
    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: {Location: handleCallback(requestOrigin(c), c.req.query()), 'Cache-Control': 'no-store'},
    });
});

router.post('/oauth/token', async (c) => {
    const {status, body} = await handleToken(requestOrigin(c), await c.req.text());
    return new Response(body, {status, headers: JSON_HEADERS});
});

export const publicPrefixes = ['/api/mcp', '/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server'] as const;

export default router;
