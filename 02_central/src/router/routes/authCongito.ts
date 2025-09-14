import {getLogger} from '@/logger';
import {Router} from '@/router/router';
import {APIGatewayProxyResult} from 'aws-lambda';

const router = new Router();

type Body = {
    client_id: string;
    client_secret: string;
    code: string;
    grant_type: string;
    redirect_uri: string;
};

router.get('/api/auth/cognito/public', async () => {
    return {
        statusCode: 200,
        body: 'Ok',
        headers: {
            'Content-Type': 'text/plain',
        },
    };
});

router.get('/api/auth/cognito/private', async () => {
    return {
        statusCode: 200,
        body: 'Ok',
        headers: {
            'Content-Type': 'text/plain',
        },
    };
});

const parseBody = (body: string, isBase64Encoded: boolean): Body => {
    if (isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf-8');
    }

    const result: Record<string, string> = {};

    body.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        result[key] = decodeURIComponent(value);
    });

    return result as Body;
};

router.post('/api/auth/cognito/token', async (event) => {
    const logger = getLogger(); // Get logger at runtime
    const {body, isBase64Encoded} = event;
    if (!body) {
        logger.error('No body found');
        return {
            statusCode: 400,
            body: 'Bad Request',
        };
    }

    const result = parseBody(body, isBase64Encoded);
    const token = await (
        await fetch(
            `https://github.com/login/oauth/access_token?client_id=${result.client_id}&client_secret=${result.client_secret}&code=${result.code}`,
            {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                },
            },
        )
    ).json();

    const response: APIGatewayProxyResult = {
        isBase64Encoded: false,
        statusCode: 200,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(token),
    };

    return response;
});

router.get('/api/auth/cognito/user', async (event) => {
    const user: any = await (
        await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
                authorization: event.headers['authorization'] ?? '',
                accept: 'application/json',
            },
        })
    ).json();

    const response: APIGatewayProxyResult = {
        isBase64Encoded: false,
        statusCode: 200,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sub: user.id,
            ...user,
        }),
    };

    return response;
});

export default router;
