import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {Middleware} from '../router';

export const lowercaseHeaders: Middleware = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult | undefined> => {
    if (!event.headers) {
        return undefined;
    }

    const lowercaseHeaders = Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value]));
    event.headers = lowercaseHeaders;

    return undefined;
};
