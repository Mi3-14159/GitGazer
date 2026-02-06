import {getLogger} from '@/logger';
import {createHmac, randomBytes} from 'crypto';

import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {
    BadRequestError,
    ForbiddenError,
    HttpStatusCodes,
    InternalServerError,
    Router,
    UnauthorizedError,
} from '@aws-lambda-powertools/event-handler/http';
import {State, UserAttributes, WSToken} from '@common/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';
const router = new Router();

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN;
if (!COGNITO_DOMAIN) {
    throw new Error('COGNITO_DOMAIN environment variable is not set');
}

const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
if (!COGNITO_CLIENT_ID) {
    throw new Error('COGNITO_CLIENT_ID environment variable is not set');
}

const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
if (!COGNITO_CLIENT_SECRET) {
    throw new Error('COGNITO_CLIENT_SECRET environment variable is not set');
}

const COGNITO_REDIRECT_URI = process.env.COGNITO_REDIRECT_URI;
if (!COGNITO_REDIRECT_URI) {
    throw new Error('COGNITO_REDIRECT_URI environment variable is not set');
}

const ALLOWED_FRONTEND_ORIGINS = process.env.ALLOWED_FRONTEND_ORIGINS;
if (!ALLOWED_FRONTEND_ORIGINS) {
    throw new Error('ALLOWED_FRONTEND_ORIGINS environment variable is not set');
}

const ALLOWED_FRONTEND_ORIGINS_ARRAY = JSON.parse(ALLOWED_FRONTEND_ORIGINS) as string[];

// Helper to validate redirect URL against allowlist
const validateRedirectUrl = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        const isAllowed = ALLOWED_FRONTEND_ORIGINS_ARRAY.some((origin) => {
            const allowedOrigin = new URL(origin);
            return parsed.origin === allowedOrigin.origin;
        });
        return isAllowed ? url : null;
    } catch {
        return null;
    }
};

type Body = {
    client_id: string;
    client_secret: string;
    code: string;
    grant_type: string;
    redirect_uri: string;
};

type TokenResponse = {
    access_token: string;
    id_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
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

router.post('/api/auth/cognito/token', async (reqCtx: AppRequestContext) => {
    const {body, isBase64Encoded} = reqCtx.event as APIGatewayProxyEventV2;
    if (!body) {
        throw new BadRequestError('Missing request body');
    }

    const result = parseBody(body, isBase64Encoded);
    if (!result.client_id || !result.client_secret || !result.code) {
        throw new BadRequestError('Missing required parameters');
    }

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

router.get('/api/auth/cognito/user', async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const response = await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
            authorization: event.headers['authorization'] ?? '',
            accept: 'application/json',
        },
    });

    if (!response.ok) {
        return {
            statusCode: response.status,
            headers: {
                'Cache-Control': 'no-cache, no-store, max-age=0',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({error: 'Failed to fetch user info from GitHub'}),
        };
    }

    const user = await response.json();

    return {
        statusCode: response.status,
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

router.get('/api/user', async (reqCtx: AppRequestContext) => {
    const {userId, username, email, name, nickname, picture} = reqCtx.appContext!;

    if (!userId) {
        throw new ForbiddenError('userId is missing');
    }

    const user: UserAttributes = {
        sub: userId,
        username: username,
        email: email,
        name: name,
        nickname: nickname,
        picture: picture,
    };

    return new Response(JSON.stringify(user), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    });
});

router.get('/api/auth/callback', async (reqCtx: AppRequestContext) => {
    const logger = getLogger();
    logger.info('OAuth callback handler invoked');

    // Extract authorization code from query parameters
    const code = reqCtx.event.queryStringParameters?.code;
    const state = reqCtx.event.queryStringParameters?.state;

    if (!code) {
        throw new BadRequestError('Missing authorization code');
    }

    if (!state) {
        throw new BadRequestError('Missing state parameter');
    }

    logger.debug('Exchanging authorization code for tokens', {state});

    // Exchange code for tokens at Cognito token endpoint
    const tokenEndpoint = `https://${COGNITO_DOMAIN}/oauth2/token`;

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: COGNITO_CLIENT_ID,
        code: code,
        redirect_uri: COGNITO_REDIRECT_URI,
    });

    // Build headers with optional client secret for confidential client
    const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    headers['Authorization'] = `Basic ${Buffer.from(`${COGNITO_CLIENT_ID}:${COGNITO_CLIENT_SECRET}`).toString('base64')}`;

    const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers,
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

    // Calculate cookie expiration (use token expiry time)
    const maxAge = tokens.expires_in;

    // Set HttpOnly cookies with security attributes
    const cookies = [
        `accessToken=${tokens.access_token}; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=${maxAge}`,
        `idToken=${tokens.id_token}; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=${maxAge}`,
        `refreshToken=${tokens.refresh_token}; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=${60 * 60 * 24 * 30}`, // 30 days
    ];

    // Decode state parameter (base64-encoded JSON)
    const decodedState = Buffer.from(state, 'base64').toString('utf-8');
    const stateData = JSON.parse(decodedState) as State;

    if (!stateData.redirect_url) {
        throw new BadRequestError('Missing redirect_url in state');
    }

    const validatedRedirectUrl = validateRedirectUrl(stateData.redirect_url);
    if (!validatedRedirectUrl) {
        throw new BadRequestError('Invalid redirect_url in state');
    }

    logger.info('OAuth callback successful, redirecting to frontend', {
        frontendUrl: validatedRedirectUrl,
    });

    // Redirect to frontend with cookies set
    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: {
            Location: validatedRedirectUrl,
            'Set-Cookie': cookies.join(', '),
        },
    });
});

router.post('/api/auth/refresh', async (reqCtx: AppRequestContext) => {
    const logger = getLogger();
    logger.info('Token refresh handler invoked');

    // Extract refresh token from cookies
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const cookies = event.cookies || [];
    let refreshToken: string | null = null;

    for (const cookieString of cookies) {
        const cookiePairs = cookieString.split(';').map((c: string) => c.trim());
        for (const pair of cookiePairs) {
            const [name, value] = pair.split('=');
            if (name === 'refreshToken') {
                refreshToken = value;
                break;
            }
        }
        if (refreshToken) break;
    }

    if (!refreshToken) {
        throw new UnauthorizedError('Missing refresh token');
    }

    logger.debug('Refreshing tokens using refresh token');

    // Exchange refresh token for new access and ID tokens
    const tokenEndpoint = `https://${COGNITO_DOMAIN}/oauth2/token`;

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: COGNITO_CLIENT_ID,
        refresh_token: refreshToken,
    });

    const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${COGNITO_CLIENT_ID}:${COGNITO_CLIENT_SECRET}`).toString('base64')}`,
    };

    const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers,
        body: params.toString(),
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Failed to refresh tokens', {
            status: tokenResponse.status,
            error: errorText,
        });

        // Clear cookies on refresh failure
        const clearCookies = [
            'accessToken=; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=0',
            'idToken=; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=0',
            'refreshToken=; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=0',
        ];

        return new Response(JSON.stringify({error: 'Failed to refresh tokens'}), {
            status: HttpStatusCodes.UNAUTHORIZED,
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': clearCookies.join(', '),
            },
        });
    }

    const tokens: TokenResponse = await tokenResponse.json();
    logger.debug('Successfully refreshed tokens');

    // Calculate cookie expiration (use token expiry time)
    const maxAge = tokens.expires_in;

    // Set new HttpOnly cookies with security attributes
    const cookies_out = [
        `accessToken=${tokens.access_token}; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=${maxAge}`,
        `idToken=${tokens.id_token}; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=${maxAge}`,
        // Keep existing refresh token (Cognito may or may not return a new one)
        ...(tokens.refresh_token
            ? [`refreshToken=${tokens.refresh_token}; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=${60 * 60 * 24 * 30}`]
            : []),
    ];

    logger.info('Token refresh successful');

    return new Response(JSON.stringify({success: true}), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
            'Set-Cookie': cookies_out.join(', '),
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

    const clearCookies = [
        'accessToken=; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=0',
        'idToken=; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=0',
        'refreshToken=; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=0',
    ];

    // Build Cognito logout URL
    const logoutUrl = `https://${COGNITO_DOMAIN}/logout`;
    const params = new URLSearchParams({
        client_id: COGNITO_CLIENT_ID,
        logout_uri: validatedRedirectUrl,
    });

    logger.info('Logout successful, clearing cookies and redirecting to Cognito', {
        redirectUrl: validatedRedirectUrl,
    });

    // Redirect to Cognito logout with cookies cleared
    return new Response(null, {
        status: HttpStatusCodes.FOUND,
        headers: {
            Location: `${logoutUrl}?${params.toString()}`,
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

    // Create a simple token payload
    const tokenPayload: WSToken = {
        sub: userId,
        username,
        email,
        integrations,
        exp: Math.floor(Date.now() / 1000) + 60 * 10, // Expires in 10 minutes
        nonce: randomBytes(16).toString('hex'), // Add nonce for uniqueness
    };

    // Sign the token using HMAC with the Cognito client secret
    // This prevents tampering and allows validation on the WebSocket handler
    const payload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const signature = createHmac('sha256', COGNITO_CLIENT_SECRET).update(payload).digest('base64url');
    const token = `${payload}.${signature}`;

    logger.info('Generated WebSocket token', {userId, integrations: integrations.length});

    return new Response(JSON.stringify({token}), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    });
});

export default router;
