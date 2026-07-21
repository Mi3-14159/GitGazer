import {mcpOrigin} from '@/domains/mcp/mcp.controller';
import config from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {BadRequestError, InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2} from 'aws-lambda';
import {createHash, createHmac, randomBytes, timingSafeEqual} from 'crypto';

const PROXY_STATE_TTL_S = 600;
const SUPPORTED_SCOPES = ['openid', 'email', 'profile'] as const;
const DEFAULT_SCOPE = SUPPORTED_SCOPES.join(' ');

/**
 * Allowlist for the client redirect_uri we relay the authorization code to. This is the
 * open-redirect gate: our /callback receives the code from Cognito and 302-relays it to this
 * URI, so an unrestricted value would leak authorization codes to attacker-controlled sites.
 * Because the proxy uses a single static Cognito client, this allowlist stands in for the
 * per-client "pre-registered redirect URIs" that OAuth would normally enforce.
 *
 * Native-app loopback (RFC 8252) is always allowed — VS Code, Claude Code, and most desktop
 * clients catch the redirect on a temporary http://127.0.0.1|localhost:<port>/callback listener.
 * Hosted HTTPS redirects (VS Code's vscode.dev, Claude Desktop / claude.ai connectors, …) come
 * from the operator-configurable `mcpAllowedRedirectHosts` list, so a new MCP client can be
 * onboarded without a code change.
 */
const isAllowedRedirectUri = (uri: string): boolean => {
    let u: URL;
    try {
        u = new URL(uri);
    } catch {
        return false;
    }
    // Native-app loopback (RFC 8252): any 127.0.0.0/8 address, localhost, or IPv6 ::1.
    if (u.protocol === 'http:' && (/^127(?:\.\d{1,3}){3}$/.test(u.hostname) || u.hostname === 'localhost' || u.hostname === '[::1]')) return true;
    if (u.protocol === 'https:') {
        const allowedHosts = config.get('mcpAllowedRedirectHosts') as string[];
        return allowedHosts.some((host) => host.toLowerCase() === u.hostname);
    }
    return false;
};

const constantTimeEqual = (a: string, b: string): boolean => {
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb);
};

type ProxyState = {redirectUri: string; clientState?: string; exp: number; nonce: string};

// The client's redirect_uri + state are HMAC-signed into the `state` we hand Cognito, so the
// flow is stateless (no server-side store) and the relay target cannot be tampered with.
const signProxyState = (redirectUri: string, clientState: string | undefined): string => {
    const stateSecret = config.get('stateSecret');
    if (!stateSecret) {
        getLogger().error('MCP OAuth proxy: stateSecret is not configured');
        throw new InternalServerError('MCP OAuth is not configured');
    }
    const state: ProxyState = {
        redirectUri,
        clientState,
        exp: Math.floor(Date.now() / 1000) + PROXY_STATE_TTL_S,
        nonce: randomBytes(8).toString('hex'),
    };
    const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
    const signature = createHmac('sha256', stateSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
};

const verifyProxyState = (token: string): ProxyState | null => {
    const stateSecret = config.get('stateSecret');
    if (!stateSecret) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = createHmac('sha256', stateSecret).update(payload).digest('base64url');
    if (!constantTimeEqual(signature, expected)) return null;
    let decoded: ProxyState;
    try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as ProxyState;
    } catch {
        return null;
    }
    if (typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    // Re-check the allowlist on the way out — defence in depth against a tampered/expired secret.
    if (typeof decoded.redirectUri !== 'string' || !isAllowedRedirectUri(decoded.redirectUri)) return null;
    return decoded;
};

const callbackUrl = (event: APIGatewayProxyEventV2): string => `${mcpOrigin(event)}/api/mcp/oauth/callback`;

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414) for our proxy. Advertising a
 * `registration_endpoint` lets MCP clients self-register (skipping the "provide a client ID"
 * prompt); authorize/token point at our proxy, which relays to Cognito.
 */
export const buildAuthServerMetadata = (event: APIGatewayProxyEventV2): Record<string, unknown> => {
    const origin = mcpOrigin(event);
    return {
        issuer: origin,
        authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
        token_endpoint: `${origin}/api/mcp/oauth/token`,
        registration_endpoint: `${origin}/api/mcp/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: [...SUPPORTED_SCOPES],
    };
};

/** Dynamic Client Registration (RFC 7591) shim: return the pre-provisioned public MCP client. */
export const handleRegister = (rawBody: string | undefined, isBase64Encoded = false): Record<string, unknown> => {
    const bodyStr = rawBody && isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf-8') : rawBody;
    let body: {redirect_uris?: unknown} = {};
    if (bodyStr) {
        try {
            body = JSON.parse(bodyStr) as {redirect_uris?: unknown};
        } catch {
            throw new BadRequestError('Invalid registration request body');
        }
    }
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
    const {mcpClientId} = config.get('cognito');
    return {
        client_id: mcpClientId,
        redirect_uris: redirectUris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
    };
};

/** Authorize: validate the request, then redirect to Cognito using OUR callback as redirect_uri. */
export const handleAuthorize = (event: APIGatewayProxyEventV2): string => {
    const q = event.queryStringParameters ?? {};
    if (q.response_type !== 'code') throw new BadRequestError('unsupported response_type');
    if (!q.redirect_uri || !isAllowedRedirectUri(q.redirect_uri)) throw new BadRequestError('invalid redirect_uri');
    if (!q.code_challenge || q.code_challenge_method !== 'S256') throw new BadRequestError('PKCE with S256 is required');

    const {domain, mcpClientId} = config.get('cognito');
    const authorizeUrl = new URL(`https://${domain}/oauth2/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', mcpClientId);
    authorizeUrl.searchParams.set('redirect_uri', callbackUrl(event));
    authorizeUrl.searchParams.set('code_challenge', q.code_challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    // Clamp requested scopes to what we advertise, so a client cannot escalate (e.g. to
    // aws.cognito.signin.user.admin); the Cognito client's allowed scopes are the second gate.
    const scope =
        (q.scope || DEFAULT_SCOPE)
            .split(/\s+/)
            .filter((s) => (SUPPORTED_SCOPES as readonly string[]).includes(s))
            .join(' ') || DEFAULT_SCOPE;
    authorizeUrl.searchParams.set('scope', scope);
    authorizeUrl.searchParams.set('state', signProxyState(q.redirect_uri, q.state));
    authorizeUrl.searchParams.set('identity_provider', 'Github');
    return authorizeUrl.toString();
};

/** Callback: verify our signed state, then relay the code (or error) to the client's redirect_uri. */
export const handleCallback = (event: APIGatewayProxyEventV2): string => {
    const q = event.queryStringParameters ?? {};
    const decoded = q.state ? verifyProxyState(q.state) : null;
    if (!decoded) throw new BadRequestError('Invalid or expired OAuth state');

    const target = new URL(decoded.redirectUri);
    if (q.error) {
        target.searchParams.set('error', q.error);
        if (q.error_description) target.searchParams.set('error_description', q.error_description);
    } else if (q.code) {
        target.searchParams.set('code', q.code);
    } else {
        throw new BadRequestError('Missing authorization code');
    }
    if (decoded.clientState !== undefined) target.searchParams.set('state', decoded.clientState);
    return target.toString();
};

/** Token: relay the exchange to Cognito, forcing our public client id + callback (PKCE passes through). */
export const handleToken = async (
    event: APIGatewayProxyEventV2,
    rawBody: string | undefined,
    isBase64Encoded: boolean,
): Promise<{status: number; body: string}> => {
    const bodyStr = rawBody ? (isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf-8') : rawBody) : '';
    const params = new URLSearchParams(bodyStr);
    const {domain, mcpClientId} = config.get('cognito');

    params.set('client_id', mcpClientId);
    if (params.get('grant_type') === 'authorization_code') {
        params.set('redirect_uri', callbackUrl(event));
    }

    const tokenResponse = await fetch(`https://${domain}/oauth2/token`, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: params.toString(),
    });
    const responseBody = await tokenResponse.text();
    if (!tokenResponse.ok) {
        getLogger().warn('MCP OAuth token exchange failed', {status: tokenResponse.status, body: responseBody});
    }
    return {status: tokenResponse.status, body: responseBody};
};
