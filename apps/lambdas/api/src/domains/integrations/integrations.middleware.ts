import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';
import type {AppEnv} from '@/shared/hono/env';
import {getLogger} from '@gitgazer/backend-core/logger';
import type {MiddlewareHandler} from 'hono';

export const addUserIntegrationsToCtx: MiddlewareHandler<AppEnv> = async (c, next) => {
    const logger = getLogger();
    logger.debug('running addUserIntegrationsToCtx middleware');
    const appContext = c.var.appContext!;

    const integrationRoles = await getUserIntegrationRoles(appContext.userId);
    appContext.integrationRoles = integrationRoles;
    appContext.integrations = Object.keys(integrationRoles);
    logger.debug('User integrations from RDS', {integrations: appContext.integrations});

    await next();
};
