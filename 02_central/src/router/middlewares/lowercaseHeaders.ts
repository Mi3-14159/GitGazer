import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';

export const lowercaseHeaders = async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<void> => {
    if (!event.headers) {
        return;
    }

    const normalizedHeaders = Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value]));
    event.headers = normalizedHeaders;
};
