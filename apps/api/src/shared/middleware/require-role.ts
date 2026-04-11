import {getLogger} from '@/shared/logger';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, ForbiddenError} from '@aws-lambda-powertools/event-handler/http';
import {Middleware, NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {hasRole, type MemberRole} from '@gitgazer/db/types';

/**
 * Route-level middleware factory that enforces a minimum integration role.
 *
 * Reads the `integrationId` path parameter and looks up the caller's role from
 * `appContext.integrationRoles` (populated by `addUserIntegrationsToCtx`).
 *
 * Must be placed **after** `addUserIntegrationsToCtx` in the middleware chain.
 */
export const requireRole = (minimumRole: MemberRole): Middleware => {
    return async ({reqCtx, next}: {reqCtx: AppRequestContext; next: NextFunction}) => {
        const logger = getLogger();
        const integrationId = reqCtx.params?.integrationId;
        const userId = reqCtx.appContext?.userId;
        const integrationRoles = reqCtx.appContext?.integrationRoles;

        if (!integrationId) {
            logger.error('requireRole: missing integrationId path parameter — check route definition');
            throw new BadRequestError('Missing integration identifier');
        }

        if (!integrationRoles) {
            logger.warn('requireRole: integrationRoles not populated — is addUserIntegrationsToCtx applied?');
            throw new ForbiddenError('Not a member of this integration');
        }

        const userRole = integrationRoles[integrationId];

        if (!userRole) {
            logger.warn('requireRole: user is not a member of integration', {userId, integrationId, minimumRole});
            throw new ForbiddenError('Not a member of this integration');
        }

        if (!hasRole(userRole, minimumRole)) {
            logger.warn('requireRole: insufficient permissions', {userId, integrationId, userRole, minimumRole});
            throw new ForbiddenError('Insufficient permissions');
        }

        // Attach resolved role for downstream controller logic
        reqCtx.appContext!.role = userRole;

        logger.debug('requireRole: authorized', {userId, integrationId, userRole, minimumRole});
        await next();
    };
};
