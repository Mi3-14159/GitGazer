import {exchangeGitHubOAuthToken, fetchGitHubUser, parseOAuthTokenBody} from '@/domains/users/users.controller';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, ForbiddenError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {UserAttributes} from '@gitgazer/db/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

router.post('/api/auth/cognito/token', async (reqCtx: AppRequestContext) => {
    const {body, isBase64Encoded} = reqCtx.event as APIGatewayProxyEventV2;
    if (!body) {
        throw new BadRequestError('Missing request body');
    }

    const result = parseOAuthTokenBody(body, isBase64Encoded);
    if (!result.client_id || !result.client_secret || !result.code) {
        throw new BadRequestError('Missing required parameters');
    }

    const token = await exchangeGitHubOAuthToken(result.client_id, result.client_secret, result.code);

    return new Response(JSON.stringify(token), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    });
});

router.get('/api/auth/cognito/user', async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const result = await fetchGitHubUser(event.headers['authorization'] ?? '');

    return {
        statusCode: result.status,
        headers: result.headers,
        body: result.body,
    };
});

router.get('/api/user', async (reqCtx: AppRequestContext) => {
    const {userId, username, email, name, nickname, picture} = reqCtx.appContext!;

    if (!userId) {
        throw new ForbiddenError('userId is missing');
    }

    const user: UserAttributes = {
        userId,
        username,
        email,
        name,
        nickname,
        picture,
    };

    return new Response(JSON.stringify(user), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    });
});

export default router;
