import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, ForbiddenError} from '@/shared/hono/http-errors';
import {getLogger} from '@gitgazer/backend-core/logger';
import {hasRole, type MemberRole} from '@gitgazer/db/types';
import type {MiddlewareHandler} from 'hono';
import {routePath} from 'hono/route';

/**
 * Route-level middleware factory that enforces a minimum integration role.
 *
 * Reads the `integrationId` path parameter and looks up the caller's role from
 * `appContext.integrationRoles` (populated by `addUserIntegrationsToCtxHono`).
 *
 * Must be placed **after** `addUserIntegrationsToCtxHono` in the middleware chain.
 */
export const requireRole = (minimumRole: MemberRole): MiddlewareHandler<AppEnv> => {
    return async (c, next) => {
        const logger = getLogger();
        const integrationId = c.req.param('integrationId');
        const appContext = c.var.appContext;
        const userId = appContext?.userId;
        const integrationRoles = appContext?.integrationRoles;
        const action = `${c.req.method} ${routePath(c, -1)}`;

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
        appContext!.role = userRole;

        logger.debug('authz', {userId, integrationId, role: userRole, minimumRole, action, allowed: true});
        await next();
    };
};
