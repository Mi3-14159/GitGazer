import {getLogger} from '@/logger';
import {AuthorizerContext} from '@/types';
import {CognitoJwtVerifier} from 'aws-jwt-verify';
import {APIGatewayRequestAuthorizerEventV2, APIGatewaySimpleAuthorizerWithContextResult} from 'aws-lambda';

const logger = getLogger();

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

/**
 * Extract token from Cookie header
 */
function extractTokenFromCookies(cookies: string[] | undefined, tokenName: string): string | null {
    if (!cookies || cookies.length === 0) {
        return null;
    }

    // Parse all cookies and find the specified token
    for (const cookieString of cookies) {
        const cookies = cookieString.split(';').map((c) => c.trim());
        for (const cookie of cookies) {
            const [name, value] = cookie.split('=');
            if (name === tokenName) {
                return value;
            }
        }
    }

    return null;
}

/**
 * Lambda authorizer that validates access tokens from HttpOnly cookies
 */
export const handler = async (event: APIGatewayRequestAuthorizerEventV2): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext>> => {
    logger.info('Authorizer invoked', {
        routeArn: event.routeArn,
        routeKey: event.routeKey,
    });

    try {
        // Extract both access and ID tokens from cookies
        const accessToken = extractTokenFromCookies(event.cookies, 'accessToken');
        const idToken = extractTokenFromCookies(event.cookies, 'idToken');

        if (!accessToken || !idToken) {
            logger.warn('Missing access or ID token in cookies');
            return {
                isAuthorized: false,
                context: {
                    userId: '',
                    username: '',
                    email: '',
                    name: '',
                    nickname: '',
                    picture: '',
                },
            };
        }

        // Verify both tokens
        try {
            const accessPayload = await accessTokenVerifier.verify(accessToken);
            const idPayload = await idTokenVerifier.verify(idToken);

            logger.debug('Tokens verified successfully', {
                sub: accessPayload.sub,
                username: accessPayload.username,
            });

            // Return authorization result with user context from ID token
            return {
                isAuthorized: true,
                context: {
                    userId: idPayload.sub,
                    username: (idPayload.username as string) || (idPayload['cognito:username'] as string) || '',
                    email: (idPayload.email as string) || '',
                    name: (idPayload.name as string) || '',
                    nickname: (idPayload.nickname as string) || '',
                    picture: (idPayload.picture as string) || '',
                },
            };
        } catch (error) {
            logger.error('Token verification failed', {error});
            return {
                isAuthorized: false,
                context: {
                    userId: '',
                    username: '',
                    email: '',
                    name: '',
                    nickname: '',
                    picture: '',
                },
            };
        }
    } catch (error) {
        logger.error('Unexpected error in authorizer', {error});
        return {
            isAuthorized: false,
            context: {
                userId: '',
                username: '',
                email: '',
                name: '',
                nickname: '',
                picture: '',
            },
        };
    }
};
