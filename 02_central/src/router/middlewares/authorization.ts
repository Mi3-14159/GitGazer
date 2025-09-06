import {getLogger} from '@/logger';
import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2} from 'aws-lambda/trigger/api-gateway-proxy';

const logger = getLogger();

export const extractCognitoGroups = async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2 | void> => {
    const {rawPath} = event;

    // skip authorization for Cognito routes
    if (rawPath.startsWith('/api/auth/cognito/')) {
        return;
    }

    const cognitoGroups = event.requestContext?.authorizer?.jwt?.claims?.['cognito:groups'] as string | undefined;
    logger.debug('Cognito groups:', cognitoGroups);
    if (!cognitoGroups) {
        return {
            statusCode: 401,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                error: 'Unauthorized: missing cognito:groups',
            }),
        };
    }

    const trimmedGroups = cognitoGroups.slice(1, -1).split(' ');
    if (!trimmedGroups || trimmedGroups.length === 0) {
        return {
            statusCode: 401,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                error: 'Unauthorized: empty cognito:groups',
            }),
        };
    }

    event.requestContext.authorizer.jwt.claims['cognito:groups'] = trimmedGroups;
};
