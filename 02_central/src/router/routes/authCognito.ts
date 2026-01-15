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

export default router;
