import {getLogger} from '@/logger';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';

const logger = getLogger();

export const lowercaseHeaders = async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<void> => {
    logger.debug('running lowercaseHeaders middleware');
    if (!event.headers) {
        return;
    }

    const normalizedHeaders = Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value]));
    event.headers = normalizedHeaders;
};
