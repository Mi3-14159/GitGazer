import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';
import type {AppEnv} from '@/shared/hono/env';
import {getLogger} from '@gitgazer/backend-core/logger';
import {AppRequestContext} from '@gitgazer/backend-core/types';
import {NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {Middleware} from '@aws-lambda-powertools/event-handler/types';
import type {MiddlewareHandler} from 'hono';

export const addUserIntegrationsToCtx: Middleware = async ({reqCtx, next}: {reqCtx: AppRequestContext; next: NextFunction}) => {
    const logger = getLogger();
    logger.debug('running addUserIntegrationsToCtx middleware');
    const {userId} = reqCtx.appContext!;

    const integrationRoles = await getUserIntegrationRoles(userId);
    reqCtx.appContext!.integrationRoles = integrationRoles;
    reqCtx.appContext!.integrations = Object.keys(integrationRoles);
    logger.debug('User integrations from RDS', {integrations: reqCtx.appContext!.integrations});

    await next();
};

export const addUserIntegrationsToCtxHono: MiddlewareHandler<AppEnv> = async (c, next) => {
    const logger = getLogger();
    logger.debug('running addUserIntegrationsToCtx middleware');
    const appContext = c.var.appContext!;

    const integrationRoles = await getUserIntegrationRoles(appContext.userId);
    appContext.integrationRoles = integrationRoles;
    appContext.integrations = Object.keys(integrationRoles);
    logger.debug('User integrations from RDS', {integrations: appContext.integrations});

    await next();
};
