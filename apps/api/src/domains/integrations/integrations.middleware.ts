import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';
import {getLogger} from '@/shared/logger';
import {AppRequestContext} from '@/shared/types';
import {NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {Middleware} from '@aws-lambda-powertools/event-handler/types';

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
