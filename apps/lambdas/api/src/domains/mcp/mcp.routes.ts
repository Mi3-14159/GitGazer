import {
    buildAuthServerMetadata,
    handleAuthorize,
    handleAuthorizeConfirm,
    handleCallback,
    handleRegister,
    handleToken,
} from '@/domains/mcp/mcp-oauth.controller';
import {buildProtectedResourceMetadata, mcpTokenVerifier, protectedResourceMetadataUrl} from '@/domains/mcp/mcp.controller';
import {createMcpServer} from '@/domains/mcp/mcp.server';
import type {AppEnv} from '@/shared/hono/env';
import {HttpStatusCodes} from '@/shared/errors';
import {buildClearStateCookie, extractTokenFromCookies, getRequestCookies, OAUTH_STATE_COOKIE_NAME} from '@/shared/helpers/cookies';
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
        getLogger().info('MCP request unauthenticated', {status: auth.status});
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

const formString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

router.post('/oauth/authorize', async (c) => {
    const form = await c.req.parseBody();
    const {location, stateCookie} = handleAuthorizeConfirm(requestOrigin(c), c.req.header('origin'), {
        request: formString(form.request),
        session: formString(form.session),
    });
    const headers = new Headers({Location: location, 'Cache-Control': 'no-store'});
    headers.append('Set-Cookie', stateCookie);
    return new Response(null, {status: HttpStatusCodes.SEE_OTHER, headers});
});

router.get('/oauth/callback', async (c) => {
    const nonce = extractTokenFromCookies(getRequestCookies(c), OAUTH_STATE_COOKIE_NAME);
    const headers = new Headers({Location: handleCallback(requestOrigin(c), c.req.query(), nonce), 'Cache-Control': 'no-store'});
    headers.append('Set-Cookie', buildClearStateCookie());
    return new Response(null, {status: HttpStatusCodes.FOUND, headers});
});

router.post('/oauth/token', async (c) => {
    const {status, body} = await handleToken(requestOrigin(c), await c.req.text());
    return new Response(body, {status, headers: JSON_HEADERS});
});

export const publicPrefixes = ['/api/mcp', '/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server'] as const;

export default router;
