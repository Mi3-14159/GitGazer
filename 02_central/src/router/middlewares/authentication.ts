import {getLogger} from '@/logger';
import {AppRequestContext} from '@/types';
import {HttpStatusCodes} from '@aws-lambda-powertools/event-handler/http';
import {NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {CognitoJwtVerifier} from 'aws-jwt-verify';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
if (!COGNITO_USER_POOL_ID) {
    throw new Error('COGNITO_USER_POOL_ID environment variable is not set');
}

const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
if (!COGNITO_CLIENT_ID) {
    throw new Error('COGNITO_CLIENT_ID environment variable is not set');
}

// Create JWT verifiers for both access and ID tokens
const accessTokenVerifier = CognitoJwtVerifier.create({
    userPoolId: COGNITO_USER_POOL_ID,
    clientId: COGNITO_CLIENT_ID,
    tokenUse: 'access',
});

const idTokenVerifier = CognitoJwtVerifier.create({
    userPoolId: COGNITO_USER_POOL_ID,
    clientId: COGNITO_CLIENT_ID,
    tokenUse: 'id',
});

function extractTokenFromCookies(cookies: string[] | undefined, tokenName: string): string | null {
    if (!cookies || cookies.length === 0) {
        return null;
    }

    // Parse all cookies and find the specified token
    for (const cookieString of cookies) {
        const cookiePairs = cookieString.split(';').map((c) => c.trim());
        for (const cookie of cookiePairs) {
            const [name, value] = cookie.split('=');
            if (name === tokenName) {
                return value;
            }
        }
    }

    return null;
}

export const authenticate = async ({reqCtx, next}: {reqCtx: AppRequestContext; next: NextFunction}) => {
    const logger = getLogger();
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const {rawPath} = event;

    // Skip authentication for public routes
    const publicRoutes = [
        '/api/auth/cognito/',
        '/api/auth/callback',
        '/api/auth/refresh',
        '/api/import/', // Webhook endpoints
        '/fe-failover/',
    ];

    if (publicRoutes.some((route) => rawPath.startsWith(route))) {
        logger.debug('Skipping authentication for public route', {rawPath});
        await next();
        return;
    }

    logger.debug('Running authentication middleware', {rawPath});

    // Extract tokens from cookies
    const cookies = event.cookies || [];
    const accessToken = extractTokenFromCookies(cookies, 'accessToken');
    const idToken = extractTokenFromCookies(cookies, 'idToken');
    const refreshToken = extractTokenFromCookies(cookies, 'refreshToken');

    const hasRefreshToken = !!refreshToken;

    if (!accessToken || !idToken) {
        logger.warn('Missing access or ID token in cookies', {
            hasAccessToken: !!accessToken,
            hasIdToken: !!idToken,
            hasRefreshToken,
            rawPath,
        });
        return new Response(
            JSON.stringify({
                error: 'Unauthorized: missing authentication tokens',
            }),
            {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {'Content-Type': 'application/json'},
            },
        );
    }

    try {
        const accessPayload = await accessTokenVerifier.verify(accessToken);
        const idPayload = await idTokenVerifier.verify(idToken);

        logger.debug('Tokens verified successfully', {
            sub: accessPayload.sub,
            username: accessPayload.username,
            rawPath,
        });

        reqCtx.appContext = {
            userId: idPayload.sub,
            username: (idPayload.username as string) || (idPayload['cognito:username'] as string) || '',
            email: (idPayload.email as string) || '',
            name: (idPayload.name as string) || '',
            nickname: (idPayload.nickname as string) || '',
            picture: (idPayload.picture as string) || '',
        };
    } catch (error: any) {
        const errorMessage = error?.message || 'Unknown error';
        const isExpiredError = errorMessage.includes('expired') || errorMessage.includes('Token expired');

        logger.error('Token verification failed', {
            error: errorMessage,
            errorType: error?.name,
            isExpiredError,
            hasRefreshToken,
            rawPath,
        });

        return new Response(
            JSON.stringify({
                error: 'Unauthorized: invalid or expired tokens',
            }),
            {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {'Content-Type': 'application/json'},
            },
        );
    }

    await next();
};
