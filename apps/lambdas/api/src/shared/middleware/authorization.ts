import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';
import {ForbiddenError} from '@/shared/errors';
import type {AppEnv} from '@/shared/hono/env';
import {checkAccess, forbiddenFor} from '@/shared/permissions/check-access';
import {OPERATIONS, ROUTES} from '@/shared/permissions/table';
import {getLogger} from '@gitgazer/backend-core/logger';
import type {MiddlewareHandler} from 'hono';
import {matchedRoutes} from 'hono/route';

export const authorize: MiddlewareHandler<AppEnv> = async (c, next) => {
    const routes = matchedRoutes(c).filter((r) => r.method !== 'ALL');
    const route = routes[routes.length - 1];
    if (!route) {
        await next();
        return;
    }

    const key = `${route.method} ${route.path}`;
    const operation = ROUTES[key as keyof typeof ROUTES];
    const appContext = c.var.appContext!;
    if (!operation) {
        getLogger().info('authz', {userId: appContext?.userId, action: key, allowed: false, reason: 'no permission entry'});
        throw new ForbiddenError('Insufficient permissions');
    }

    const entry: {access: unknown; checkedInHandler?: true} = OPERATIONS[operation];
    if (typeof entry.access === 'string' || entry.checkedInHandler) {
        await next();
        return;
    }

    // A router-level middleware sees no route params, so read the id from the path itself.
    const integrationId = c.req.path.split('/')[route.path.split('/').indexOf(':integrationId')];

    if (!appContext.integrationRoles) {
        appContext.integrationRoles = await getUserIntegrationRoles(appContext.userId);
        appContext.integrations = Object.keys(appContext.integrationRoles);
    }

    const decision = checkAccess({userId: appContext.userId, integrationRoles: appContext.integrationRoles}, operation, integrationId);
    if (!decision.allowed) {
        throw forbiddenFor(decision);
    }
    appContext.role = decision.role;
    await next();
};
