import config from '@/shared/config';
import {extractTokenFromCookies} from '@/shared/helpers/cookies';
import {getLogger} from '@/shared/logger';
import {publicRoutePrefixes} from '@/shared/middleware/public-routes';
import {AppRequestContext} from '@/shared/types';
import {InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {Middleware, NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {db, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {users} from '@gitgazer/db/schema/gitgazer';
import {pendingOrgSync, userAssignments} from '@gitgazer/db/schema/github/workflows';
import {CognitoJwtVerifier} from 'aws-jwt-verify';
import {CognitoJwtPayload} from 'aws-jwt-verify/jwt-model';
import {APIGatewayProxyEventV2} from 'aws-lambda';
import {eq} from 'drizzle-orm';

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

    const githubIdClaim = idPayload['custom:github_id'] as string | undefined;
    const githubId = githubIdClaim ? Number(githubIdClaim) : null;

    let userId: number;
    try {
        const email = (idPayload.email as string) || null;
        const name = (idPayload.name as string) || null;
        const picture = (idPayload.picture as string) || null;
        const githubLogin = (idPayload.nickname as string) || null;

        const user = await db
            .insert(users)
            .values({
                cognitoId: idPayload.sub,
                email,
                name,
                picture,
                githubId,
                githubLogin,
            })
            .onConflictDoUpdate({
                target: users.cognitoId,
                set: {
                    email,
                    name,
                    picture,
                    githubId,
                    githubLogin,
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

    // Resolve pending org sync entries (deferred matching for org members who logged in for the first time)
    // Runs outside the user-upsert try/catch — failures must never block authentication
    if (githubId) {
        await resolvePendingOrgSync(userId, githubId);
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

/**
 * Resolves any pending org sync entries for a user who just logged in.
 * For each match: inserts a user-assignment and deletes the pending row.
 * Runs once per login — negligible performance impact for users with no pending entries.
 */
const resolvePendingOrgSync = async (userId: number, githubId: number): Promise<void> => {
    const logger = getLogger();

    try {
        const pending = await db.select().from(pendingOrgSync).where(eq(pendingOrgSync.githubUserId, githubId));

        if (pending.length === 0) return;

        logger.info('Found pending org sync entries for user', {userId, githubId, count: pending.length});

        for (const entry of pending) {
            await withRlsTransaction({
                integrationIds: [entry.integrationId],
                userName: gitgazerWriter.name,
                callback: async (tx) => {
                    await tx
                        .insert(userAssignments)
                        .values({
                            integrationId: entry.integrationId,
                            userId,
                            role: entry.role,
                            source: 'org_sync',
                        })
                        .onConflictDoNothing({
                            target: [userAssignments.userId, userAssignments.integrationId],
                        });
                },
            });
        }

        // Delete all resolved pending entries across all integrations.
        // Deliberately uses raw `db` (master user) to bypass RLS — this must delete by
        // githubUserId across every integration, which no single RLS scope can cover.
        await db.delete(pendingOrgSync).where(eq(pendingOrgSync.githubUserId, githubId));

        logger.info('Resolved pending org sync entries', {userId, githubId, resolved: pending.length});
    } catch (error) {
        // Non-critical: log and continue — user can still use the app, just won't get auto-added yet
        logger.error('Failed to resolve pending org sync entries', {
            userId,
            githubId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
