import parser from "lambda-multipart-parser";

import {APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult} from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
    console.info(`handle event`, {event});
    const {httpMethod, path} = event;
    const routeKey = `${httpMethod} ${path}`
    switch (routeKey) {
        case `GET /public`:
        case `GET /private`:
            return {
                isBase64Encoded: false,
                statusCode: 200,
                headers: {
                    'Cache-Control': 'public, max-age=604800', // 1 week
                },
                body: 'Hello World!',
            };
        case `POST /token`:
            return handleTokenRoute(event);
        case `GET /user`:
            return handleUserRoute(event);
        default:
            console.error(`Unknown route: ${routeKey}`);
            break;
    }
};

const handleTokenRoute = async (event: APIGatewayProxyEvent) => {
    const result = await parser.parse(event);
    const token = await (
        await fetch(
            `https://github.com/login/oauth/access_token?client_id=${result.client_id}&client_secret=${result.client_secret}&code=${result.code}`,
            {
                method: "POST",
                headers: {
                    accept: "application/json",
                },
            }
        )
    ).json();

    const response: APIGatewayProxyResult =  {
        isBase64Encoded: false,
        statusCode: 200,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            "Content-Type": "application/json"
        },
        body: JSON.stringify(token),
    };
    return response;
}

const handleUserRoute = async (event: APIGatewayProxyEvent) => {
    const user: any = await (
        await fetch("https://api.github.com/user", {
            method: "GET",
            headers: {
                authorization: event.headers["Authorization"],
                accept: "application/json",
            },
        })
    ).json();
    
    const response: APIGatewayProxyResult = {
        isBase64Encoded: false,
        statusCode: 200,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            sub: user.id,
            ...user,
        }),
    };
    return response;
};