import {validateRedirectUrl} from '@/domains/auth/auth.helpers';
import config from '@/shared/config';
import {buildAuthCookies, buildClearCookies, buildStateCookie} from '@/shared/helpers/cookies';
import {getLogger} from '@/shared/logger';
import {BadRequestError, ForbiddenError, InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {WSToken} from '@gitgazer/db/types';
import {createHash, createHmac, randomBytes, timingSafeEqual} from 'crypto';

type TokenResponse = {
    access_token: string;
    id_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
};

/**
 * Exchange an authorization code for Cognito tokens and return Set-Cookie headers.
 */
export const exchangeCodeForTokens = async (code: string): Promise<{tokens: TokenResponse; cookies: string[]}> => {
    const logger = getLogger();
    const {domain, clientId, clientSecret, redirectUri} = config.get('cognito');
    const tokenEndpoint = `https://${domain}/oauth2/token`;

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: params.toString(),
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Failed to exchange code for tokens', {
            status: tokenResponse.status,
            error: errorText,
        });
        throw new InternalServerError('Failed to exchange code for tokens');
    }

    const tokens: TokenResponse = await tokenResponse.json();
    logger.debug('Successfully obtained tokens from Cognito');

    return {tokens, cookies: buildAuthCookies(tokens)};
};

/**
 * Refresh Cognito tokens using a refresh token.
 * Returns new cookies on success, or clear-cookies + error on failure.
 */
export const refreshTokens = async (refreshToken: string): Promise<{success: true; cookies: string[]} | {success: false; clearCookies: string[]}> => {
    const logger = getLogger();
    const {domain, clientId, clientSecret} = config.get('cognito');
    const tokenEndpoint = `https://${domain}/oauth2/token`;

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
    });

    const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: params.toString(),
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Failed to refresh tokens', {
            status: tokenResponse.status,
            error: errorText,
        });
        return {success: false, clearCookies: buildClearCookies()};
    }

    const tokens: TokenResponse = await tokenResponse.json();
    logger.debug('Successfully refreshed tokens');

    return {success: true, cookies: buildAuthCookies(tokens)};
};

/**
 * Generate a signed WebSocket token for authenticated users.
 */
export const generateWsToken = (params: {userId: number; username: string; email: string; integrations: string[]}): string => {
    const tokenPayload: WSToken = {
        userId: params.userId,
        username: params.username,
        email: params.email,
        integrations: params.integrations,
        exp: Math.floor(Date.now() / 1000) + 60,
        nonce: randomBytes(16).toString('hex'),
    };

    const wsTokenSecret = config.get('wsTokenSecret');
    const payload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const signature = createHmac('sha256', wsTokenSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
};

const STATE_TOKEN_TTL_SECONDS = 600; // 10 minutes — must match the state cookie Max-Age
const COGNITO_OAUTH_SCOPE = 'email openid profile aws.cognito.signin.user.admin';

/**
 * Decoded payload carried inside the signed OAuth `state` token. `nonce` is also
 * stored in a short-lived httpOnly cookie and must match it on the callback.
 */
type StateTokenPayload = {
    redirect_url: string;
    nonce: string;
    exp: number;
};

/** Constant-time string comparison. Hashes both sides so length is never leaked. */
const constantTimeEqual = (a: string, b: string): boolean => {
    const hashA = createHash('sha256').update(a).digest();
    const hashB = createHash('sha256').update(b).digest();
    return timingSafeEqual(hashA, hashB);
};

/**
 * Mint a signed, single-use OAuth `state` token bound to a random nonce.
 * Returns the token (placed in the Cognito `state` parameter) and the nonce
 * (stored in a short-lived httpOnly cookie for callback verification).
 */
export const mintStateToken = (params: {redirect_url: string}): {token: string; nonce: string} => {
    const nonce = randomBytes(16).toString('hex');
    const statePayload: StateTokenPayload = {
        redirect_url: params.redirect_url,
        nonce,
        exp: Math.floor(Date.now() / 1000) + STATE_TOKEN_TTL_SECONDS,
    };

    const stateSecret = config.get('stateSecret');
    const payload = Buffer.from(JSON.stringify(statePayload)).toString('base64url');
    const signature = createHmac('sha256', stateSecret).update(payload).digest('base64url');
    return {token: `${payload}.${signature}`, nonce};
};

/**
 * Verify a signed OAuth `state` token against the nonce stored in the httpOnly
 * cookie. Returns the decoded payload when the signature, expiry and nonce all
 * check out, otherwise null. All comparisons are constant-time.
 */
export const verifyStateToken = (token: string | undefined, nonceFromCookie: string | null): StateTokenPayload | null => {
    if (!token || !nonceFromCookie) {
        return null;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
        return null;
    }
    const [payload, signature] = parts;

    const stateSecret = config.get('stateSecret');
    const expectedSignature = createHmac('sha256', stateSecret).update(payload).digest('base64url');
    if (!constantTimeEqual(signature, expectedSignature)) {
        return null;
    }

    let decoded: StateTokenPayload;
    try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as StateTokenPayload;
    } catch {
        return null;
    }

    if (typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) {
        return null;
    }

    if (typeof decoded.nonce !== 'string' || !constantTimeEqual(decoded.nonce, nonceFromCookie)) {
        return null;
    }

    return decoded;
};

/**
 * Build the Cognito hosted-UI redirect for sign-in initiation: validate the
 * requested redirect URL, mint a state token + nonce, and return the Cognito
 * authorize URL (carrying the signed state) plus the httpOnly state cookie.
 */
export const buildLoginRedirect = (redirectUrl: string | undefined): {location: string; stateCookie: string} => {
    if (!redirectUrl) {
        throw new BadRequestError('Missing redirect_url parameter');
    }

    const validatedRedirectUrl = validateRedirectUrl(redirectUrl);
    if (!validatedRedirectUrl) {
        throw new BadRequestError('Invalid redirect_url parameter');
    }

    const {token, nonce} = mintStateToken({redirect_url: validatedRedirectUrl});

    const {domain, clientId, redirectUri} = config.get('cognito');
    const authorizeUrl = new URL(`https://${domain}/oauth2/authorize`);
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', COGNITO_OAUTH_SCOPE);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('state', token);

    return {location: authorizeUrl.toString(), stateCookie: buildStateCookie(nonce)};
};

/**
 * Handle the OAuth callback: verify the signed state token + nonce BEFORE
 * exchanging the authorization code, then validate the redirect target. Throws
 * (and never reaches the token exchange) when the state is missing, forged or
 * expired — this ordering is the security crux of the login-CSRF protection.
 */
export const handleOAuthCallback = async (params: {
    code: string | undefined;
    state: string | undefined;
    oauthStateNonce: string | null;
}): Promise<{cookies: string[]; redirectUrl: string}> => {
    const {code, state, oauthStateNonce} = params;

    if (!code) {
        throw new BadRequestError('Missing authorization code');
    }
    if (!state) {
        throw new BadRequestError('Missing state parameter');
    }

    // SECURITY: validate the signed state + nonce before any upstream token exchange.
    const verifiedState = verifyStateToken(state, oauthStateNonce);
    if (!verifiedState) {
        throw new ForbiddenError('Invalid or expired OAuth state');
    }

    const validatedRedirectUrl = validateRedirectUrl(verifiedState.redirect_url);
    if (!validatedRedirectUrl) {
        throw new BadRequestError('Invalid redirect_url in state');
    }

    // Only after the state is verified do we exchange the authorization code.
    const {cookies} = await exchangeCodeForTokens(code);
    return {cookies, redirectUrl: validatedRedirectUrl};
};
