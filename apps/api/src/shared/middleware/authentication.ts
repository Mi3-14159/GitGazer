import config from '@/shared/config';
import {extractTokenFromCookies} from '@/shared/helpers/cookies';
import {getLogger} from '@/shared/logger';
import {publicRoutePrefixes} from '@/shared/middleware/public-routes';
import {AppRequestContext} from '@/shared/types';
import {InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {Middleware, NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {db} from '@gitgazer/db/client';
import {users} from '@gitgazer/db/schema/gitgazer';
import {CognitoJwtVerifier} from 'aws-jwt-verify';
import {CognitoJwtPayload} from 'aws-jwt-verify/jwt-model';
import {APIGatewayProxyEventV2} from 'aws-lambda';

type TokenVerifiers = {
    accessTokenVerifier: ReturnType<typeof CognitoJwtVerifier.create>;
    idTokenVerifier: ReturnType<typeof CognitoJwtVerifier.create>;
};

let verifiers: TokenVerifiers | null = null;

const getVerifiers = (): TokenVerifiers => {
    if (!verifiers) {
        const {userPoolId, clientId} = config.get('cognito');

        verifiers = {
            accessTokenVerifier: CognitoJwtVerifier.create({
                userPoolId,
                clientId,
                tokenUse: 'access',
            }),
            idTokenVerifier: CognitoJwtVerifier.create({
                userPoolId,
                clientId,
                tokenUse: 'id',
            }),
        };
    }
    return verifiers;
};

export const authenticate: Middleware = async ({reqCtx, next}: {reqCtx: AppRequestContext; next: NextFunction}) => {
    const logger = getLogger();
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const {rawPath} = event;

    // Skip authentication for public routes (declared by each domain)
    if (publicRoutePrefixes.some((prefix) => rawPath.startsWith(prefix))) {
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
        throw new UnauthorizedError('Missing authentication tokens');
    }

    let idPayload: CognitoJwtPayload;
    try {
        const {accessTokenVerifier, idTokenVerifier} = getVerifiers();
        const accessPayload = await accessTokenVerifier.verify(accessToken);
        idPayload = await idTokenVerifier.verify(idToken);

        logger.debug('Tokens verified successfully', {
            sub: accessPayload.sub,
            username: accessPayload.username,
            rawPath,
        });
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

        throw new UnauthorizedError('Invalid or expired authentication tokens');
    }

    let userId: number;
    try {
        const user = await db
            .insert(users)
            .values({
                cognitoId: idPayload.sub,
            })
            .onConflictDoUpdate({
                target: users.cognitoId,
                set: {
                    cognitoId: idPayload.sub,
                },
            })
            .returning({id: users.id});

        if (user.length === 0) {
            logger.error('Failed to upsert user: No user returned from database', {
                cognitoId: idPayload.sub,
            });
            throw new InternalServerError('Failed to process user information');
        }

        userId = user[0].id;

        logger.debug('User upserted successfully', {
            cognitoId: idPayload.sub,
        });
    } catch (error: any) {
        logger.error('Failed to upsert user in database', {
            error,
            cognitoId: idPayload.sub,
        });
        throw new InternalServerError('Failed to process user information');
    }

    reqCtx.appContext = {
        userId,
        username: (idPayload.username as string) || (idPayload['cognito:username'] as string) || '',
        email: (idPayload.email as string) || '',
        name: (idPayload.name as string) || '',
        nickname: (idPayload.nickname as string) || '',
        picture: (idPayload.picture as string) || '',
    };

    await next();
};
