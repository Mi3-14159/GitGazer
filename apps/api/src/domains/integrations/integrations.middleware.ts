import {getUserIntegrations} from '@/domains/integrations/integrations.controller';
import {getLogger} from '@/shared/logger';
import {AppRequestContext} from '@/shared/types';
import {NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {Middleware} from '@aws-lambda-powertools/event-handler/types';

export const addUserIntegrationsToCtx: Middleware = async ({reqCtx, next}: {reqCtx: AppRequestContext; next: NextFunction}) => {
    const logger = getLogger();
    logger.debug('running addUserIntegrationsToCtx middleware');
    const {userId} = reqCtx.appContext!;

    const integrations = await getUserIntegrations(userId);
    reqCtx.appContext!.integrations = integrations;
    logger.debug('User integrations from RDS', {integrations});

    await next();
};
