import {Middleware} from '@/router/router';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';

export const lowercaseHeaders: Middleware = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult | undefined> => {
    if (!event.headers) {
        return undefined;
    }

    const lowercaseHeaders = Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value]));
    event.headers = lowercaseHeaders;

    return undefined;
};
