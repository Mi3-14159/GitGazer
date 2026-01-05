import {getLogger} from '@/logger';

import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';

const router = new Router();

type Body = {
    client_id: string;
    client_secret: string;
    code: string;
    grant_type: string;
    redirect_uri: string;
};

router.get('/api/auth/cognito/public', async () => {
    return 'Ok';
});

router.get('/api/auth/cognito/private', async () => {
    return 'Ok';
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

router.post('/api/auth/cognito/token', async (reqCtx) => {
    const logger = getLogger(); // Get logger at runtime
    const {body, isBase64Encoded} = reqCtx.event;
    if (!body) {
        logger.error('No body found');
        return new Response('Body is required', {
            status: HttpStatusCodes.BAD_REQUEST,
        });
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

    reqCtx.isBase64Encoded = false;
    return new Response(JSON.stringify(token), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    });
});

router.get('/api/auth/cognito/user', async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const user: any = await (
        await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
                authorization: event.headers['authorization'] ?? '',
                accept: 'application/json',
            },
        })
    ).json();

    reqCtx.isBase64Encoded = false;
    const body = {
        sub: user.id,
        ...user,
    };
    return new Response(JSON.stringify(body), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    });
});

export default router;
