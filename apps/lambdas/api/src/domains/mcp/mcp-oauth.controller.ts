import {mintSignedState, verifySignedState} from '@/domains/auth/auth.controller';
import {isAllowedFrontendOrigin} from '@/domains/auth/auth.helpers';
import {mcpOrigin} from '@/domains/mcp/mcp.controller';
import config from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {buildStateCookie} from '@/shared/helpers/cookies';
import {BadRequestError, ForbiddenError, InternalServerError} from '@/shared/errors';
import {ADVERTISED_SCOPES, MCP_WRITE_SCOPE, READ_SESSION_SCOPES} from '@/shared/mcp-scope';
import {createHash, createHmac, randomBytes, timingSafeEqual} from 'crypto';

const CONNECT_REQUEST_TTL_S = 600;

/**
 * Open-redirect gate for the client's redirect_uri: /callback relays the Cognito auth code to this
 * URI, so an unrestricted value would leak codes to attackers. Because the proxy uses one static
 * Cognito client, this allowlist substitutes for the per-client redirect URIs OAuth would normally
 * register. Native-app loopback (RFC 8252) is always allowed; hosted HTTPS redirects come from the
 * operator-configurable `mcpAllowedRedirectHosts` (so a new client is onboarded without code changes).
 */
const isAllowedRedirectUri = (uri: string): boolean => {
    let u: URL;
    try {
        u = new URL(uri);
    } catch {
        return false;
    }
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

type ConnectRequest = {purpose: 'mcp_connect'; redirectUri: string; clientState?: string; codeChallenge: string; exp: number; nonce: string};

// The client's authorize parameters are HMAC-signed into the opaque `request` handed to the
// connect page, so the flow is stateless and the relay target cannot be tampered with.
const signConnectRequest = (redirectUri: string, clientState: string | undefined, codeChallenge: string): string => {
    const stateSecret = config.get('stateSecret');
    if (!stateSecret) {
        getLogger().error('MCP OAuth proxy: stateSecret is not configured');
        throw new InternalServerError('MCP OAuth is not configured');
    }
    const request: ConnectRequest = {
        purpose: 'mcp_connect',
        redirectUri,
        clientState,
        codeChallenge,
        exp: Math.floor(Date.now() / 1000) + CONNECT_REQUEST_TTL_S,
        nonce: randomBytes(8).toString('hex'),
    };
    const payload = Buffer.from(JSON.stringify(request)).toString('base64url');
    const signature = createHmac('sha256', stateSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
};

const verifyConnectRequest = (token: string): ConnectRequest | null => {
    const stateSecret = config.get('stateSecret');
    if (!stateSecret) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = createHmac('sha256', stateSecret).update(payload).digest('base64url');
    if (!constantTimeEqual(signature, expected)) return null;
    let decoded: ConnectRequest;
    try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as ConnectRequest;
    } catch {
        return null;
    }
    if (decoded.purpose !== 'mcp_connect') return null;
    if (typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    // Re-check the allowlist on the way out — defence in depth against a tampered/expired secret.
    if (typeof decoded.redirectUri !== 'string' || !isAllowedRedirectUri(decoded.redirectUri)) return null;
    return decoded;
};

const callbackUrl = (requestOrigin: string): string => `${mcpOrigin(requestOrigin)}/api/mcp/oauth/callback`;

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414) for our proxy. Advertising a
 * `registration_endpoint` lets MCP clients self-register (skipping the "provide a client ID"
 * prompt); authorize/token point at our proxy, which relays to Cognito.
 */
export const buildAuthServerMetadata = (requestOrigin: string): Record<string, unknown> => {
    const origin = mcpOrigin(requestOrigin);
    return {
        issuer: origin,
        authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
        token_endpoint: `${origin}/api/mcp/oauth/token`,
        registration_endpoint: `${origin}/api/mcp/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        authorization_response_iss_parameter_supported: true,
        scopes_supported: [...ADVERTISED_SCOPES],
    };
};

/** Dynamic Client Registration (RFC 7591) shim: return the pre-provisioned public MCP client. */
export const handleRegister = (rawBody: string): Record<string, unknown> => {
    let body: {redirect_uris?: unknown} = {};
    if (rawBody) {
        try {
            body = JSON.parse(rawBody) as {redirect_uris?: unknown};
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

/**
 * Authorize: validate the request, then hand off to the web connect page where the user picks a
 * read-only or read & write session. The client's `scope` is ignored: only that choice decides it.
 */
export const handleAuthorize = (requestOrigin: string, q: Record<string, string>): string => {
    if (q.response_type !== 'code') throw new BadRequestError('unsupported response_type');
    if (!q.redirect_uri || !isAllowedRedirectUri(q.redirect_uri)) throw new BadRequestError('invalid redirect_uri');
    if (!q.code_challenge || q.code_challenge_method !== 'S256') throw new BadRequestError('PKCE with S256 is required');

    const connectUrl = new URL(`${mcpOrigin(requestOrigin)}/mcp/connect`);
    connectUrl.searchParams.set('request', signConnectRequest(q.redirect_uri, q.state, q.code_challenge));
    return connectUrl.toString();
};

/**
 * Confirm: the connect page's form POST. The Origin check keeps another site from submitting the
 * form on the user's behalf; the state cookie then binds the Cognito round trip to this browser.
 */
export const handleAuthorizeConfirm = (
    requestOrigin: string,
    origin: string | undefined,
    form: {request?: string; session?: string},
): {location: string; stateCookie: string} => {
    if (!isAllowedFrontendOrigin(origin)) throw new ForbiddenError('Origin not allowed');
    const request = form.request ? verifyConnectRequest(form.request) : null;
    if (!request) throw new BadRequestError('Invalid or expired connect request');
    if (form.session !== 'read' && form.session !== 'write') throw new BadRequestError('Invalid session type');

    const {token, nonce} = mintSignedState({
        purpose: 'mcp_authorize',
        redirectUri: request.redirectUri,
        clientState: request.clientState,
        write: form.session === 'write',
    });
    const scopes = form.session === 'write' ? [...READ_SESSION_SCOPES, MCP_WRITE_SCOPE] : READ_SESSION_SCOPES;

    const {domain, mcpClientId} = config.get('cognito');
    const authorizeUrl = new URL(`https://${domain}/oauth2/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', mcpClientId);
    authorizeUrl.searchParams.set('redirect_uri', callbackUrl(requestOrigin));
    authorizeUrl.searchParams.set('code_challenge', request.codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('scope', scopes.join(' '));
    authorizeUrl.searchParams.set('state', token);
    authorizeUrl.searchParams.set('identity_provider', 'Github');
    return {location: authorizeUrl.toString(), stateCookie: buildStateCookie(nonce)};
};

type AuthorizeState = {purpose: 'mcp_authorize'; redirectUri: string; clientState?: string; write: boolean};

/** Callback: verify our signed state against the cookie nonce, then relay the code (or error) to the client's redirect_uri. */
export const handleCallback = (requestOrigin: string, q: Record<string, string>, nonceFromCookie: string | null): string => {
    const decoded = verifySignedState<AuthorizeState>(q.state, nonceFromCookie);
    if (decoded?.purpose !== 'mcp_authorize' || !isAllowedRedirectUri(decoded.redirectUri)) {
        throw new BadRequestError('Invalid or expired OAuth state');
    }

    const target = new URL(decoded.redirectUri);
    // RFC 9207 mix-up defence: must be the same value advertised as `issuer` in the AS metadata.
    target.searchParams.set('iss', mcpOrigin(requestOrigin));
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
export const handleToken = async (requestOrigin: string, rawBody: string): Promise<{status: number; body: string}> => {
    const params = new URLSearchParams(rawBody);
    const {domain, mcpClientId} = config.get('cognito');

    params.set('client_id', mcpClientId);
    if (params.get('grant_type') === 'authorization_code') {
        params.set('redirect_uri', callbackUrl(requestOrigin));
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
