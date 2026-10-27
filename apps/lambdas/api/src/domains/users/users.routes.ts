import {assertCognitoCaller, exchangeGitHubOAuthToken, fetchGitHubUser, parseOAuthTokenBody} from '@/domains/users/users.controller';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, ForbiddenError, HttpStatusCodes} from '@/shared/errors';
import {UserAttributes} from '@gitgazer/db/types';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

router.post('/auth/cognito/token', async (c) => {
    const body = await c.req.text();
    if (!body) {
        throw new BadRequestError('Missing request body');
    }

    const result = parseOAuthTokenBody(body);

    // Authenticate the caller (only the Cognito IdP knows the OAuth app secret) before
    // doing any work with the request.
    assertCognitoCaller(result.client_id, result.client_secret);

    if (!result.code) {
        throw new BadRequestError('Missing required parameters');
    }

    const token = await exchangeGitHubOAuthToken(result.code);

    return new Response(JSON.stringify(token), {
        status: HttpStatusCodes.OK,
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    });
});

router.get('/auth/cognito/user', async (c) => {
    const result = await fetchGitHubUser(c.req.header('authorization') ?? '');

    return new Response(result.body, {status: result.status, headers: result.headers});
});

router.get('/user', async (c) => {
    const {userId, username, email, name, nickname, picture} = c.var.appContext!;

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
