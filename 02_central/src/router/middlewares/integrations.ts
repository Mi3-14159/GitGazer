import {getUserIntegrations} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {AppRequestContext} from '@/types';
import {HttpStatusCodes} from '@aws-lambda-powertools/event-handler/http';
import {NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';

export const addUserIntegrationsToCtx = async ({reqCtx, next}: {reqCtx: AppRequestContext; next: NextFunction}) => {
    const logger = getLogger();
    logger.debug('running addUserIntegrationsToCtx middleware');
    const {userId} = reqCtx.appContext!;

    try {
        const integrations = await getUserIntegrations(userId);
        logger.debug('User integrations from DynamoDB', {integrations});

        await next();
    } catch (error) {
        logger.error('Failed to get user integrations', {error});
        return new Response(
            JSON.stringify({
                error: 'Internal Server Error',
            }),
            {
                status: HttpStatusCodes.INTERNAL_SERVER_ERROR,
                headers: {'Content-Type': 'application/json'},
            },
        );
    }
};
