import {getLogger} from '@/logger';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda/trigger/api-gateway-proxy';
import {Middleware} from '../router';

const logger = getLogger();

export type JwtPayload = {
    sub: string;
    'cognito:groups'?: string[];
    [key: string]: any;
};

export const decodeJwtPayload = (token: string): JwtPayload => {
    if (typeof token !== 'string') {
        throw new Error('Token must be a string');
    }

    const parts = token.split('.');
    if (parts.length < 2) {
        throw new Error('Invalid JWT: missing payload');
    }

    const json = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(json) as JwtPayload;
};

export const extractToken = (event: APIGatewayProxyEvent): string | undefined => {
    const {headers} = event;
    const {authorization} = headers;
    if (!authorization) {
        return undefined;
    }

    return authorization.replace(/^Bearer\s+/i, '').trim();
};

export const extractCognitoGroups: Middleware = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult | undefined> => {
    const {resource} = event;

    // skip authorization for Cognito routes
    if (resource.startsWith('/api/auth/cognito/')) {
        return;
    }

    event.requestContext.authorizer = {
        isAuthorized: false,
        groups: [],
    };

    try {
        // Extract and validate JWT token
        const token = extractToken(event);
        if (!token) {
            logger.trace({msg: 'No JWT token found'});
            return undefined;
        }

        logger.trace({msg: 'JWT token extracted successfully'});

        const payload = decodeJwtPayload(token);
        const groups = payload['cognito:groups'];
        if (!Array.isArray(groups)) {
            logger.trace({msg: 'Invalid JWT: cognito:groups is not an array'});
            return undefined;
        }

        event.requestContext.authorizer = {
            isAuthorized: true,
            groups,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown authorization error';
        logger.warn(`Authorization failed: ${errorMessage}`, error);

        return {
            statusCode: 401,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                error: 'Unauthorized: ' + errorMessage,
            }),
        };
    }
};
