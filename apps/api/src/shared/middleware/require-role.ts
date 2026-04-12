import {getLogger} from '@/shared/logger';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, ForbiddenError} from '@aws-lambda-powertools/event-handler/http';
import {Middleware, NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {hasRole, type MemberRole} from '@gitgazer/db/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';

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
        const {routeKey: action} = reqCtx.event as APIGatewayProxyEventV2;

        if (!integrationId) {
            logger.error('requireRole: missing integrationId path parameter — check route definition');
            throw new BadRequestError('Missing integration identifier');
        }

        if (!integrationRoles) {
            logger.info('authz', {userId, integrationId, role: null, minimumRole, action, allowed: false, reason: 'no integration roles loaded'});
            throw new ForbiddenError('Not a member of this integration');
        }

        const userRole = integrationRoles[integrationId];

        if (!userRole) {
            logger.info('authz', {userId, integrationId, role: null, minimumRole, action, allowed: false, reason: 'not a member'});
            throw new ForbiddenError('Not a member of this integration');
        }

        if (!hasRole(userRole, minimumRole)) {
            logger.info('authz', {userId, integrationId, role: userRole, minimumRole, action, allowed: false, reason: 'insufficient role'});
            throw new ForbiddenError('Insufficient permissions');
        }

        // Attach resolved role for downstream controller logic
        reqCtx.appContext!.role = userRole;

        logger.debug('authz', {userId, integrationId, role: userRole, minimumRole, action, allowed: true});
        await next();
    };
};
