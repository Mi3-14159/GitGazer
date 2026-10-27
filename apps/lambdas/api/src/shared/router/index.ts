import config from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {AppRequestContext} from '@gitgazer/backend-core/types';
import {createHonoApp} from '@/shared/hono/app';
import type {AppEnv} from '@/shared/hono/env';
import {authenticate} from '@/shared/middleware/authentication';
import {originCheck} from '@/shared/middleware/origin-check';
import {Router} from '@aws-lambda-powertools/event-handler/http';
import {compress, cors} from '@aws-lambda-powertools/event-handler/http/middleware';
import type {Hono} from 'hono';

let honoApp: Hono<AppEnv> | null = null;

const getHonoApp = (): Hono<AppEnv> => {
    honoApp ??= createHonoApp();
    return honoApp;
};

// Powertools 2.36 handlerResultToWebResponse uses headers.set and keeps only the last Set-Cookie; it splits a
// joined header back into the cookies array. Goes away with the bridge in Task 10.
const joinSetCookies = (response: Response): Response => {
    const cookies = response.headers.getSetCookie();
    if (cookies.length < 2) {
        return response;
    }
    const headers = new Headers(response.headers);
    headers.set('Set-Cookie', cookies.join(', '));
    return new Response(response.body, {status: response.status, headers});
};

export const createApp = (): Router => {
    const logger = getLogger();
    logger.info('Setting up routes');

    const corsOrigins = config.get('corsOrigins');

    const app = new Router({logger});
    app.use(compress());
    app.use(
        cors({
            origin: corsOrigins,
            maxAge: 300,
        }),
    );

    // Add authentication middleware globally - it handles route-specific logic internally
    app.use(authenticate);

    // CSRF protection: verify Origin header on state-changing requests
    app.use(originCheck);

    // Powertools also routes NotFoundErrors thrown by its own routes here; only unmatched requests go to Hono.
    app.notFound(async (error, reqCtx: AppRequestContext) => {
        if (reqCtx.route) {
            return error.toWebResponse();
        }
        const response = await getHonoApp().fetch(reqCtx.req, {appContext: reqCtx.appContext, event: reqCtx.event, lambdaContext: reqCtx.context});
        return joinSetCookies(response);
    });

    logger.info('Routes setup completed');

    return app;
};
