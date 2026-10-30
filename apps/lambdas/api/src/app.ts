import appsRoutes from '@/domains/apps/apps.routes';
import authRoutes from '@/domains/auth/auth.routes';
import eventLogRoutes from '@/domains/event-log/event-log.routes';
import githubAppRoutes from '@/domains/github-app/github-app.routes';
import integrationsRoutes from '@/domains/integrations/integrations.routes';
import mcpRoutes, {wellKnownRoutes} from '@/domains/mcp/mcp.routes';
import membersRoutes from '@/domains/members/members.routes';
import metricsRoutes from '@/domains/metrics/metrics.routes';
import notificationsRoutes from '@/domains/notifications/notifications.routes';
import overviewRoutes from '@/domains/overview/overview.routes';
import slackRoutes from '@/domains/slack/slack.routes';
import usersRoutes from '@/domains/users/users.routes';
import importRoutes from '@/domains/webhooks/webhooks.routes';
import workflowsRoutes from '@/domains/workflows/workflows.routes';
import feFailover from '@/shared/fe-failover';
import type {AppEnv} from '@/shared/hono/env';
import {HttpError, NotFoundError} from '@/shared/errors';
import {authenticate} from '@/shared/middleware/authentication';
import {authorize} from '@/shared/middleware/authorization';
import {originCheck} from '@/shared/middleware/origin-check';
import config, {loadConfig} from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {initDb} from '@gitgazer/db/client';
import {Hono} from 'hono';
import {compress} from 'hono/compress';
import {cors} from 'hono/cors';

/** Router with the JSON error and not-found responses, without middleware or routes. */
export const createBaseApp = (): Hono<AppEnv> => {
    const app = new Hono<AppEnv>({strict: false});

    app.onError((error) => {
        if (error instanceof HttpError) {
            getLogger().debug(`There was an error processing the request: ${error}`);
            return error.toWebResponse();
        }
        getLogger().error('Unhandled error processing the request', error);
        return Response.json({statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error'}, {status: 500});
    });

    app.notFound((c) => new NotFoundError(`Route ${c.req.path} for method ${c.req.method} not found`).toWebResponse());

    return app;
};

/** All domain routers; their paths are relative to /api, or to their own mount path where they have one. */
const createApiRouter = (): Hono<AppEnv> => {
    const api = new Hono<AppEnv>();
    api.route('/event-log', eventLogRoutes);
    api.route('/workflows', workflowsRoutes);
    api.route('/overview', overviewRoutes);
    api.route('/metrics', metricsRoutes);
    api.route('/auth', authRoutes);
    api.route('/integrations', integrationsRoutes);
    api.route('/integrations/:integrationId', appsRoutes);
    api.route('/mcp', mcpRoutes);
    api.route('/github', githubAppRoutes);
    api.route('/import', importRoutes);
    // These domains' routes span several prefixes, so their paths stay relative to /api
    api.route('/', notificationsRoutes);
    api.route('/', usersRoutes);
    api.route('/', membersRoutes);
    api.route('/', slackRoutes);
    return api;
};

export const createApp = (): Hono<AppEnv> => {
    const logger = getLogger();
    logger.info('Setting up routes');

    const app = createBaseApp();
    app.use(compress());
    app.use(cors({origin: config.get('corsOrigins')}));
    app.use(authenticate);
    app.use(originCheck);
    app.use(authorize);

    app.route('/api', createApiRouter());
    app.route('/', wellKnownRoutes);
    app.route('/', feFailover);

    logger.info('Routes setup completed');

    return app;
};

let appPromise: Promise<Hono<AppEnv>> | null = null;

export const initApp = (): Promise<Hono<AppEnv>> => {
    appPromise ??= (async () => {
        await initDb();
        await loadConfig();
        return createApp();
    })();
    return appPromise;
};
