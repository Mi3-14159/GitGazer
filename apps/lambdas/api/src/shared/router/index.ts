import appsRoutes from '@/domains/apps/apps.routes';
import authRoutes from '@/domains/auth/auth.routes';
import githubAppRoutes from '@/domains/github-app/github-app.routes';
import integrationsRoutes from '@/domains/integrations/integrations.routes';
import mcpRoutes from '@/domains/mcp/mcp.routes';
import membersRoutes from '@/domains/members/members.routes';
import notificationsRoutes from '@/domains/notifications/notifications.routes';
import slackRoutes from '@/domains/slack/slack.routes';
import usersRoutes from '@/domains/users/users.routes';
import importRoutes from '@/domains/webhooks/webhooks.routes';
import config from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {AppRequestContext} from '@gitgazer/backend-core/types';
import {createHonoApp} from '@/shared/hono/app';
import type {AppEnv} from '@/shared/hono/env';
import {authenticate} from '@/shared/middleware/authentication';
import {originCheck} from '@/shared/middleware/origin-check';
import feFailover from '@/shared/router/feFailover';
import {Router} from '@aws-lambda-powertools/event-handler/http';
import {compress, cors} from '@aws-lambda-powertools/event-handler/http/middleware';
import type {Hono} from 'hono';

let honoApp: Hono<AppEnv> | null = null;

const getHonoApp = (): Hono<AppEnv> => {
    honoApp ??= createHonoApp();
    return honoApp;
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

    app.includeRouter(authRoutes);
    app.includeRouter(usersRoutes);
    app.includeRouter(githubAppRoutes);
    app.includeRouter(importRoutes);
    app.includeRouter(feFailover);
    app.includeRouter(notificationsRoutes);
    app.includeRouter(integrationsRoutes);
    app.includeRouter(appsRoutes);
    app.includeRouter(slackRoutes);
    app.includeRouter(membersRoutes);
    app.includeRouter(mcpRoutes);

    // Powertools also routes NotFoundErrors thrown by its own routes here; only unmatched requests go to Hono.
    app.notFound(async (error, reqCtx: AppRequestContext) => {
        if (reqCtx.route) {
            return error.toWebResponse();
        }
        return getHonoApp().fetch(reqCtx.req, {appContext: reqCtx.appContext, event: reqCtx.event, lambdaContext: reqCtx.context});
    });

    logger.info('Routes setup completed');

    return app;
};
