import {APIGatewayProxyResult} from 'aws-lambda';
import {getLogger} from '../../logger';
import {Router} from '../router';

const logger = getLogger();
const router = new Router();

type Body = {
    client_id: string;
    client_secret: string;
    code: string;
    grant_type: string;
    redirect_uri: string;
};

router.get('/api/auth/cognito/public', async () => {
    logger.info('Handling request for /api/auth/cognito/public');

    return {
        statusCode: 200,
        body: 'Ok',
        headers: {
            'Content-Type': 'text/plain',
        },
    };
});

router.get('/api/auth/cognito/private', async () => {
    logger.info('Handling request for /api/auth/cognito/private');

    return {
        statusCode: 200,
        body: 'Ok',
        headers: {
            'Content-Type': 'text/plain',
        },
    };
});

const parseBody = (body: string): Body => {
    const result: Record<string, string> = {};

    body.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        result[key] = decodeURIComponent(value);
    });

    return result as Body;
};

router.post('/api/auth/cognito/token', async (event) => {
    logger.info('Handling request for /api/auth/cognito/token');

    const {body} = event;
    if (!body) {
        logger.error('No body found');
        return {
            statusCode: 400,
            body: 'Bad Request',
        };
    }

    const result = parseBody(body);
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
    logger.info('Handling request for /api/auth/cognito/user');

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
