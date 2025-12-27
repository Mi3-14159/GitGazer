import {getLogger} from '@/logger';
import {HttpStatusCodes} from '@aws-lambda-powertools/event-handler/http';
import {NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {RequestContext} from '@aws-lambda-powertools/event-handler/types';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda/trigger/api-gateway-proxy';

export const extractCognitoGroups = async ({reqCtx, next}: {reqCtx: RequestContext; next: NextFunction}) => {
    const logger = getLogger();
    logger.debug('running extractCognitoGroups middleware');
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const {rawPath} = event;

    // skip authorization for Cognito routes
    if (rawPath.startsWith('/api/auth/cognito/')) {
        await next();
        return;
    }

    const cognitoGroups = event.requestContext?.authorizer?.jwt?.claims?.['cognito:groups'] as string | undefined;
    logger.debug('Cognito groups', {cognitoGroups});
    if (!cognitoGroups) {
        return new Response(
            JSON.stringify({
                error: 'Unauthorized: missing cognito:groups',
            }),
            {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {'Content-Type': 'application/json'},
            },
        );
    }

    const trimmedGroups = cognitoGroups.slice(1, -1).split(' ');
    if (!trimmedGroups || trimmedGroups.length === 0) {
        return new Response(
            JSON.stringify({
                error: 'Unauthorized: empty cognito:groups',
            }),
            {
                status: HttpStatusCodes.UNAUTHORIZED,
                headers: {'Content-Type': 'application/json'},
            },
        );
    }

    event.requestContext.authorizer.jwt.claims['cognito:groups'] = trimmedGroups;
    await next();
};
