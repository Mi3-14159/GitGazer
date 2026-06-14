import {buildLoginRedirect, generateWsToken, handleOAuthCallback, refreshTokens} from '@/domains/auth/auth.controller';
import {validateRedirectUrl} from '@/domains/auth/auth.helpers';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {buildClearCookies, buildClearStateCookie, extractTokenFromCookies, OAUTH_STATE_COOKIE_NAME} from '@/shared/helpers/cookies';
import {getLogger} from '@/shared/logger';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, ForbiddenError, HttpStatusCodes, Router, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

router.get('/api/auth/login', async (reqCtx: AppRequestContext) => {
    const logger = getLogger();
    logger.info('OAuth login initiation handler invoked');

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const {location, stateCookie} = buildLoginRedirect(event.queryStringParameters?.redirect_url);

    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: {
            Location: location,
            'Set-Cookie': stateCookie,
        },
    });
});

router.get('/api/auth/callback', async (reqCtx: AppRequestContext) => {
    const logger = getLogger();
    logger.info('OAuth callback handler invoked');

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;
    const oauthStateNonce = extractTokenFromCookies(event.cookies, OAUTH_STATE_COOKIE_NAME);

    // Verify the signed state + nonce BEFORE exchanging the code (see handleOAuthCallback).
    const {cookies, redirectUrl} = await handleOAuthCallback({code, state, oauthStateNonce});

    logger.info('OAuth callback successful, redirecting to frontend', {
        frontendUrl: redirectUrl,
    });

    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: {
            Location: redirectUrl,
            'Set-Cookie': [...cookies, buildClearStateCookie()].join(', '),
        },
    });
});

router.post('/api/auth/refresh', async (reqCtx: AppRequestContext) => {
    const logger = getLogger();
    logger.info('Token refresh handler invoked');

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const cookies = event.cookies || [];
    const refreshToken = extractTokenFromCookies(cookies, 'refreshToken');

    if (!refreshToken) {
        throw new UnauthorizedError('Missing refresh token');
    }

    logger.debug('Refreshing tokens using refresh token');

    const result = await refreshTokens(refreshToken);

    if (!result.success) {
        return new Response(JSON.stringify({error: 'Failed to refresh tokens'}), {
            status: HttpStatusCodes.UNAUTHORIZED,
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': result.clearCookies.join(', '),
            },
        });
    }

    logger.info('Token refresh successful');

    return new Response(JSON.stringify({success: true}), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
            'Set-Cookie': result.cookies.join(', '),
        },
    });
});

router.get('/api/auth/logout', async (reqCtx: AppRequestContext) => {
    const logger = getLogger();
    logger.info('Logout handler invoked');

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const redirect_uri = event.queryStringParameters?.redirect_uri;
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
        headers: {
            Location: validatedRedirectUrl,
            'Set-Cookie': clearCookies.join(', '),
        },
    });
});

router.get('/api/auth/ws-token', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const logger = getLogger();
    const {userId, username, email, integrations} = reqCtx.appContext!;

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
