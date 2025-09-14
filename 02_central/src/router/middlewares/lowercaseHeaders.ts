import {getLogger} from '@/logger';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';

export const lowercaseHeaders = async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<void> => {
    const logger = getLogger();
    logger.debug('running lowercaseHeaders middleware');
    if (!event.headers) {
        return;
    }

    const normalizedHeaders = Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value]));
    event.headers = normalizedHeaders;
};
