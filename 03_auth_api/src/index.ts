import {APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult} from "aws-lambda";
import { getClient } from "./dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = getClient();

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
    const {body} = event;
    const result = parseBody(body);
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

    const repositories = await getAllUserRepositories(event.headers["Authorization"]);

    await ddb.send(new PutCommand({
        TableName: process.env.DYNAMODB_TABLE_USERS_NAME,
        Item: {
            userId: `${user.id}`,
            repositories,
        },
    }));

    console.debug('user', JSON.stringify(user));
    console.debug('repositories', JSON.stringify(repositories));
    
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

interface Body {
    client_id: string;
    client_secret: string;
    code: string;
    grant_type: string;
    redirect_uri: string;
}

const parseBody = (body: string): Body => {
    const result: Body = {
        client_id: "",
        client_secret: "",
        code: "",
        grant_type: "",
        redirect_uri: "",
    };

    body.split("&").forEach((param) => {
        const [key, value] = param.split("=");
        result[key] = decodeURIComponent(value);
    });

    return result;
};

const getAllUserRepositories = async (authorization: string) => {
    const per_page = 100;
    let allRepos = [];
    let page = 1;

    while (true) {
        console.info(`Fetching user repositories page: ${page}`);
        const repos: any = await (
            await fetch(`https://api.github.com/user/repos?per_page=${per_page}&page=${page}&type=all`, {
                method: "GET",
                headers: {
                    authorization: authorization,
                    accept: "application/json",
                },
            })
        ).json();

        if (repos.length === 0) {
            break;
        }

        const repoNames = repos.map(repo => repo.full_name);
        allRepos.push(...repoNames);

        if (repos.length < per_page) {
            break;
        
        }
        page++;
    }
    return new Set(allRepos);
}
