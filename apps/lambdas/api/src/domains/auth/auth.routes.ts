import {buildLoginRedirect, generateWsToken, handleOAuthCallback, refreshTokens} from '@/domains/auth/auth.controller';
import {validateRedirectUrl} from '@/domains/auth/auth.helpers';
import {addUserIntegrationsToCtxHono} from '@/domains/integrations/integrations.middleware';
import {
    buildClearCookies,
    buildClearStateCookie,
    extractTokenFromCookies,
    getRequestCookies,
    OAUTH_STATE_COOKIE_NAME,
} from '@/shared/helpers/cookies';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, ForbiddenError, HttpStatusCodes, UnauthorizedError} from '@/shared/hono/http-errors';
import {getLogger} from '@gitgazer/backend-core/logger';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

// Each cookie gets its own Set-Cookie header; a joined string would be read as a single cookie.
const buildHeaders = (headers: Record<string, string>, cookies: string[]): Headers => {
    const result = new Headers(headers);
    for (const cookie of cookies) {
        result.append('Set-Cookie', cookie);
    }
    return result;
};

router.get('/api/auth/login', async (c) => {
    const logger = getLogger();
    logger.info('OAuth login initiation handler invoked');

    const {location, stateCookie} = buildLoginRedirect(c.req.query('redirect_url'));

    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: buildHeaders({Location: location}, [stateCookie]),
    });
});

router.get('/api/auth/callback', async (c) => {
    const logger = getLogger();
    logger.info('OAuth callback handler invoked');

    const code = c.req.query('code');
    const state = c.req.query('state');
    const oauthStateNonce = extractTokenFromCookies(getRequestCookies(c), OAUTH_STATE_COOKIE_NAME);

    // Verify the signed state + nonce BEFORE exchanging the code (see handleOAuthCallback).
    const {cookies, redirectUrl} = await handleOAuthCallback({code, state, oauthStateNonce});

    logger.info('OAuth callback successful, redirecting to frontend', {
        frontendUrl: redirectUrl,
    });

    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: buildHeaders({Location: redirectUrl}, [...cookies, buildClearStateCookie()]),
    });
});

router.post('/api/auth/refresh', async (c) => {
    const logger = getLogger();
    logger.info('Token refresh handler invoked');

    const refreshToken = extractTokenFromCookies(getRequestCookies(c), 'refreshToken');

    if (!refreshToken) {
        throw new UnauthorizedError('Missing refresh token');
    }

    logger.debug('Refreshing tokens using refresh token');

    const result = await refreshTokens(refreshToken);

    if (!result.success) {
        return new Response(JSON.stringify({error: 'Failed to refresh tokens'}), {
            status: HttpStatusCodes.UNAUTHORIZED,
            headers: buildHeaders({'Content-Type': 'application/json'}, result.clearCookies),
        });
    }

    logger.info('Token refresh successful');

    return new Response(JSON.stringify({success: true}), {
        status: HttpStatusCodes.OK,
        headers: buildHeaders({'Cache-Control': 'no-cache, no-store, max-age=0', 'Content-Type': 'application/json'}, result.cookies),
    });
});

router.get('/api/auth/logout', async (c) => {
    const logger = getLogger();
    logger.info('Logout handler invoked');

    const redirect_uri = c.req.query('redirect_uri');
    if (!redirect_uri) {
        throw new BadRequestError('Missing redirect_uri parameter');
    }

    const validatedRedirectUrl = validateRedirectUrl(redirect_uri);
    if (!validatedRedirectUrl) {
        throw new BadRequestError('Invalid redirect_uri parameter');
    }

    const clearCookies = buildClearCookies();

    logger.info('Logout successful, clearing cookies and redirecting', {
        redirectUrl: validatedRedirectUrl,
    });

    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: buildHeaders({Location: validatedRedirectUrl}, clearCookies),
    });
});

router.get('/api/auth/ws-token', addUserIntegrationsToCtxHono, async (c) => {
    const logger = getLogger();
    const {userId, username, email, integrations} = c.var.appContext!;

    if (!userId) {
        throw new UnauthorizedError('Missing userId for WebSocket token generation');
    }

    if (!integrations || integrations.length === 0) {
        throw new ForbiddenError('User has no integrations for WebSocket access');
    }

    const token = generateWsToken({userId, username, email, integrations});

    logger.info('Generated WebSocket token', {userId, integrations: integrations.length});

    return new Response(JSON.stringify({token}), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    });
});

export const publicPrefixes = ['/api/auth/cognito/', '/api/auth/login', '/api/auth/callback', '/api/auth/refresh'] as const;

export default router;
