import {getUserIntegrations} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {HttpStatusCodes} from '@aws-lambda-powertools/event-handler/http';
import {NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {RequestContext} from '@aws-lambda-powertools/event-handler/types';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda/trigger/api-gateway-proxy';

export const extractUserIntegrations = async ({reqCtx, next}: {reqCtx: RequestContext; next: NextFunction}) => {
    const logger = getLogger();
    logger.debug('running extractUserIntegrations middleware');
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const {rawPath} = event;

    // skip authorization for Cognito routes
    if (rawPath.startsWith('/api/auth/cognito/')) {
        await next();
        return;
    }

    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) {
        return new Response(
            JSON.stringify({
                error: 'Unauthorized: missing sub claim',
            }),
            {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {'Content-Type': 'application/json'},
            },
        );
    }

    try {
        const integrations = await getUserIntegrations(userId);
        logger.debug('User integrations from DynamoDB', {integrations});

        if (integrations.length === 0) {
            return new Response(
                JSON.stringify({
                    error: 'Unauthorized: user has no integrations',
                }),
                {
                    status: HttpStatusCodes.UNAUTHORIZED,
                    headers: {'Content-Type': 'application/json'},
                },
            );
        }

        event.requestContext.authorizer.jwt.claims['cognito:groups'] = integrations;
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
