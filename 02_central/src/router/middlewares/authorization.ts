import {getUserIntegrations} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {AuthorizerContext} from '@/types';
import {HttpStatusCodes} from '@aws-lambda-powertools/event-handler/http';
import {NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {RequestContext} from '@aws-lambda-powertools/event-handler/types';
import {APIGatewayProxyEventV2WithLambdaAuthorizer} from 'aws-lambda/trigger/api-gateway-proxy';

export const extractUserIntegrations = async ({reqCtx, next}: {reqCtx: RequestContext; next: NextFunction}) => {
    const logger = getLogger();
    logger.debug('running extractUserIntegrations middleware');
    const event = reqCtx.event as APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;
    const {rawPath} = event;

    // skip authorization for Cognito routes and callback
    if (rawPath.startsWith('/api/auth/cognito/') || rawPath.startsWith('/auth/callback')) {
        await next();
        return;
    }

    // Extract userId from Lambda authorizer context
    const userId = event.requestContext?.authorizer?.lambda?.userId;
    if (!userId) {
        return new Response(
            JSON.stringify({
                error: 'Unauthorized: missing user context',
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

        // For WebSocket token endpoint, we still need to fetch integrations
        // but we'll pass them to the route handler
        if (rawPath === '/api/auth/ws-token') {
            event.requestContext.authorizer.lambda.integrations = integrations;
            await next();
            return;
        }

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

        event.requestContext.authorizer.lambda.integrations = integrations;
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
