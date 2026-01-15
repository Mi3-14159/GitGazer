import {getLogger} from '@/logger';
import {createTokenCookies, clearTokenCookies, getCookie} from '@/utils/cookies';

import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';

const router = new Router();

type Body = {
    client_id: string;
    client_secret: string;
    code: string;
    grant_type: string;
    redirect_uri: string;
};

router.get('/api/auth/cognito/public', async () => {
    return 'Ok';
});

router.get('/api/auth/cognito/private', async () => {
    return 'Ok';
});

const parseBody = (body: string, isBase64Encoded: boolean): Body => {
    if (isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf-8');
    }

    const result: Record<string, string> = {};

    body.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        result[key] = decodeURIComponent(value);
    });

    return result as Body;
};

router.post('/api/auth/cognito/token', async (reqCtx) => {
    const logger = getLogger(); // Get logger at runtime
    const {body, isBase64Encoded} = reqCtx.event;
    if (!body) {
        logger.error('No body found');
        return new Response('Body is required', {
            status: HttpStatusCodes.BAD_REQUEST,
        });
    }

    const result = parseBody(body, isBase64Encoded);
    const token = await (
        await fetch(
            `https://github.com/login/oauth/access_token?client_id=${result.client_id}&client_secret=${result.client_secret}&code=${result.code}`,
            {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                },
            },
        )
    ).json();

    return new Response(JSON.stringify(token), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    });
});

router.get('/api/auth/cognito/user', async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const user: any = await (
        await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
                authorization: event.headers['authorization'] ?? '',
                accept: 'application/json',
            },
        })
    ).json();

    return {
        statusCode: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sub: user.id,
            ...user,
        }),
    };
});

/**
 * Exchange Amplify tokens for httpOnly cookies
 * POST /api/auth/session
 * Body: { accessToken, idToken, refreshToken, expiresIn }
 */
/**
 * OAuth callback handler
 * POST /api/auth/callback
 * Exchanges authorization code for tokens and sets httpOnly cookies
 */
router.post('/api/auth/callback', async (reqCtx) => {
    const logger = getLogger();
    const {body} = reqCtx.event;

    if (!body) {
        logger.error('No body found in callback request');
        return new Response('Body is required', {
            status: HttpStatusCodes.BAD_REQUEST,
        });
    }

    try {
        const {code, redirect_uri} = JSON.parse(body) as {
            code: string;
            redirect_uri: string;
        };

        if (!code || !redirect_uri) {
            return new Response('Missing code or redirect_uri', {
                status: HttpStatusCodes.BAD_REQUEST,
            });
        }

        // Exchange code for tokens with Cognito
        const tokenEndpoint = `https://${process.env.COGNITO_DOMAIN}/oauth2/token`;
        const clientId = process.env.COGNITO_CLIENT_ID;

        if (!tokenEndpoint || !clientId) {
            throw new Error('Cognito configuration missing');
        }

        const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                code: code,
                redirect_uri: redirect_uri,
            }),
        });

        if (!tokenResponse.ok) {
            logger.error('Token exchange failed', {status: tokenResponse.status});
            return new Response('Token exchange failed', {
                status: HttpStatusCodes.UNAUTHORIZED,
            });
        }

        const tokens = (await tokenResponse.json()) as {
            access_token: string;
            id_token: string;
            refresh_token?: string;
            token_type: string;
            expires_in: number;
        };

        // Set tokens as httpOnly cookies
        const cookieHeaders = createTokenCookies({
            accessToken: tokens.access_token,
            idToken: tokens.id_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expires_in,
        });

        return {
            statusCode: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, max-age=0',
            },
            cookies: cookieHeaders,
            body: JSON.stringify({
                success: true,
                message: 'Authentication successful',
            }),
        };
    } catch (error) {
        logger.error('Error handling OAuth callback', {error});
        return new Response('OAuth callback error', {
            status: HttpStatusCodes.INTERNAL_SERVER_ERROR,
        });
    }
});

router.post('/api/auth/session', async (reqCtx) => {
    const logger = getLogger();
    const {body} = reqCtx.event;

    if (!body) {
        logger.error('No body found in session request');
        return new Response('Body is required', {
            status: HttpStatusCodes.BAD_REQUEST,
        });
    }

    try {
        const tokens = JSON.parse(body) as {
            accessToken: string;
            idToken: string;
            refreshToken?: string;
            expiresIn?: number;
        };

        if (!tokens.accessToken || !tokens.idToken) {
            return new Response('Missing required tokens', {
                status: HttpStatusCodes.BAD_REQUEST,
            });
        }

        const cookieHeaders = createTokenCookies(tokens);

        // Use raw response format to send multiple Set-Cookie headers
        return {
            statusCode: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, max-age=0',
            },
            cookies: cookieHeaders,
            body: JSON.stringify({
                success: true,
                message: 'Session cookies set successfully',
            }),
        };
    } catch (error) {
        logger.error('Error setting session cookies', {error});
        return new Response('Invalid request body', {
            status: HttpStatusCodes.BAD_REQUEST,
        });
    }
});

/**
 * Logout and clear authentication cookies
 * POST /api/auth/logout
 */
router.post('/api/auth/logout', async () => {
    const cookieHeaders = clearTokenCookies();

    // Use raw response format to send multiple Set-Cookie headers
    return {
        statusCode: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, max-age=0',
        },
        cookies: cookieHeaders,
        body: JSON.stringify({
            success: true,
            message: 'Logged out successfully',
        }),
    };
});

/**
 * Get current session info from cookies
 * GET /api/auth/session
 */
router.get('/api/auth/session', async (reqCtx) => {
    const logger = getLogger();
    const cookieHeader = reqCtx.event.headers?.['cookie'];
    const accessToken = getCookie(cookieHeader, 'accessToken');
    const idToken = getCookie(cookieHeader, 'idToken');

    if (!accessToken || !idToken) {
        logger.debug('No valid session cookies found');
        return new Response(
            JSON.stringify({
                authenticated: false,
            }),
            {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );
    }

    return new Response(
        JSON.stringify({
            authenticated: true,
        }),
        {
            status: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, max-age=0',
            },
        },
    );
});

/**
 * Get current user info from ID token cookie
 * GET /api/auth/user
 */
router.get('/api/auth/user', async (reqCtx) => {
    const logger = getLogger();
    const cookieHeader = reqCtx.event.headers?.['cookie'];
    const idToken = getCookie(cookieHeader, 'idToken');

    if (!idToken) {
        logger.debug('No ID token found');
        return new Response(
            JSON.stringify({
                error: 'Not authenticated',
            }),
            {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );
    }

    try {
        // Decode JWT token (without verification since API Gateway already verified it)
        const parts = idToken.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid token format');
        }

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));

        // Extract user info from Cognito ID token
        const userInfo = {
            userId: payload.sub,
            email: payload.email,
            username: payload['cognito:username'] || payload.preferred_username,
            name: payload.name,
            nickname: payload.nickname,
            picture: payload.picture,
            groups: payload['cognito:groups'] || [],
        };

        return new Response(JSON.stringify(userInfo), {
            status: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, max-age=0',
            },
        });
    } catch (error) {
        logger.error('Error decoding ID token', {error});
        return new Response(
            JSON.stringify({
                error: 'Invalid token',
            }),
            {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );
    }
});

/**
 * Refresh tokens using refresh token cookie
 * POST /api/auth/refresh
 */
router.post('/api/auth/refresh', async (reqCtx) => {
    const logger = getLogger();
    const cookieHeader = reqCtx.event.headers?.['cookie'];
    const refreshToken = getCookie(cookieHeader, 'refreshToken');

    if (!refreshToken) {
        logger.debug('No refresh token found');
        return new Response(
            JSON.stringify({
                error: 'No refresh token',
            }),
            {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );
    }

    try {
        // Call Cognito to refresh tokens
        const tokenEndpoint = `https://${process.env.COGNITO_DOMAIN}/oauth2/token`;
        const clientId = process.env.COGNITO_CLIENT_ID;

        if (!tokenEndpoint || !clientId) {
            throw new Error('Cognito configuration missing');
        }

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: clientId,
                refresh_token: refreshToken,
            }),
        });

        if (!response.ok) {
            logger.error('Token refresh failed', {status: response.status});
            return new Response(
                JSON.stringify({
                    error: 'Token refresh failed',
                }),
                {
                    status: HttpStatusCodes.UNAUTHORIZED,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                },
            );
        }

        const tokens = (await response.json()) as {
            access_token: string;
            id_token: string;
            token_type: string;
            expires_in: number;
        };

        // Set new tokens as cookies
        const cookieHeaders = createTokenCookies({
            accessToken: tokens.access_token,
            idToken: tokens.id_token,
            refreshToken: refreshToken, // Keep existing refresh token
            expiresIn: tokens.expires_in,
        });

        return {
            statusCode: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, max-age=0',
            },
            cookies: cookieHeaders,
            body: JSON.stringify({
                success: true,
                message: 'Tokens refreshed',
            }),
        };
    } catch (error) {
        logger.error('Error refreshing tokens', {error});
        return new Response(
            JSON.stringify({
                error: 'Token refresh error',
            }),
            {
                status: HttpStatusCodes.INTERNAL_SERVER_ERROR,
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );
    }
});

export default router;
