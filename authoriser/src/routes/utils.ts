import {APIGatewayProxyResultV2} from 'aws-lambda';

export const response = (statusCode: number, body?: any, maxAge?: number, contentType?: string): unknown => {
    const cacheControl = maxAge ? `public, max-age=${maxAge}` : 'no-cache, no-store, max-age=0';

    const result: APIGatewayProxyResultV2 = {
        isBase64Encoded: false,
        statusCode,
        headers: {
            'Cache-Control': cacheControl,
        },
    };

    if (!body) {
        result.headers['Content-Type'] = 'application/text';
    } else if (body && typeof body === 'object') {
        result.body = JSON.stringify(body);
        result.headers['Content-Type'] = 'application/json';
    } else {
        result.body = body;
        result.headers['Content-Type'] = 'application/text';
    }

    if (contentType) {
        result.headers['Content-Type'] = contentType;
    }

    return result;
};