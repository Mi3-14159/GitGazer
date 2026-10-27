import appsRoutes from '@/domains/apps/apps.routes';
import authRoutes from '@/domains/auth/auth.routes';
import eventLogRoutes from '@/domains/event-log/event-log.routes';
import githubAppRoutes from '@/domains/github-app/github-app.routes';
import integrationsRoutes from '@/domains/integrations/integrations.routes';
import mcpRoutes from '@/domains/mcp/mcp.routes';
import membersRoutes from '@/domains/members/members.routes';
import metricsRoutes from '@/domains/metrics/metrics.routes';
import notificationsRoutes from '@/domains/notifications/notifications.routes';
import overviewRoutes from '@/domains/overview/overview.routes';
import slackRoutes from '@/domains/slack/slack.routes';
import usersRoutes from '@/domains/users/users.routes';
import importRoutes from '@/domains/webhooks/webhooks.routes';
import workflowsRoutes from '@/domains/workflows/workflows.routes';
import type {AppEnv} from '@/shared/hono/env';
import {HttpError, NotFoundError} from '@/shared/hono/http-errors';
import feFailover from '@/shared/router/feFailover';
import {getLogger} from '@gitgazer/backend-core/logger';
import {Hono} from 'hono';

export const createHonoApp = (): Hono<AppEnv> => {
    // strict: false matches Powertools, which ignores trailing slashes when matching routes
    const app = new Hono<AppEnv>({strict: false});

    app.use(async (c, next) => {
        c.set('appContext', c.env?.appContext);
        await next();
    });

    app.onError((error) => {
        getLogger().debug(`There was an error processing the request: ${error}`);
        if (error instanceof HttpError) {
            return error.toWebResponse();
        }
        return Response.json({statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error'}, {status: 500});
    });

    app.notFound((c) => {
        const path = c.req.path === '/' ? '/' : c.req.path.replace(/\/+$/, '');
        return new NotFoundError(`Route ${path} for method ${c.req.method} not found`).toWebResponse();
    });

    app.route('/', eventLogRoutes);
    app.route('/', workflowsRoutes);
    app.route('/', overviewRoutes);
    app.route('/', metricsRoutes);
    app.route('/', notificationsRoutes);
    app.route('/', usersRoutes);
    app.route('/', membersRoutes);
    app.route('/', authRoutes);
    app.route('/', integrationsRoutes);
    app.route('/', appsRoutes);
    app.route('/', slackRoutes);
    app.route('/', mcpRoutes);
    app.route('/', githubAppRoutes);
    app.route('/', importRoutes);
    app.route('/', feFailover);

    return app;
};
