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
import {originCheck} from '@/shared/middleware/origin-check';
import config, {loadConfig} from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {initDb} from '@gitgazer/db/client';
import {Hono, type MiddlewareHandler} from 'hono';
import {compress} from 'hono/compress';
import {cors} from 'hono/cors';

/** Router with the Powertools-compatible error and not-found responses, without middleware or routes. */
export const createBaseApp = (): Hono<AppEnv> => {
    // strict: false matches Powertools, which ignores trailing slashes when matching routes
    const app = new Hono<AppEnv>({strict: false});

    app.onError((error) => {
        if (error instanceof HttpError) {
            getLogger().debug(`There was an error processing the request: ${error}`);
            return error.toWebResponse();
        }
        getLogger().error('Unhandled error processing the request', error);
        return Response.json({statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error'}, {status: 500});
    });

    app.notFound((c) => {
        // c.req.path is percent-decoded; Powertools reported the raw path
        const rawPath = new URL(c.req.url).pathname;
        const path = rawPath === '/' ? rawPath : rawPath.replace(/\/+$/, '');
        return new NotFoundError(`Route ${path} for method ${c.req.method} not found`).toWebResponse();
    });

    return app;
};

// Hono's compress only checks the threshold against Content-Length, which c.json() does not set
const setContentLength: MiddlewareHandler = async (c, next) => {
    await next();
    if (!c.req.header('accept-encoding')) {
        return;
    }
    if (c.res.body && !c.res.headers.has('content-length')) {
        const body = await c.res.clone().arrayBuffer();
        c.res.headers.set('content-length', body.byteLength.toString());
    }
};

// Powertools' cors defaults; Hono's would reflect any requested header
const corsFor = (origins: string[]): MiddlewareHandler => {
    const handler = cors({
        origin: origins,
        maxAge: 300,
        allowMethods: ['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT'],
        allowHeaders: ['authorization', 'content-type', 'x-amz-date', 'x-api-key', 'x-amz-security-token'],
        exposeHeaders: [],
        credentials: false,
    });
    // Like Powertools, requests from other origins get no CORS headers and continue down the chain
    return (c, next) => (origins.includes(c.req.header('origin') ?? '') ? handler(c, next) : next());
};

/** All domain routers; their paths are relative to /api. */
const createApiRouter = (): Hono<AppEnv> => {
    const api = new Hono<AppEnv>();
    api.route('/', eventLogRoutes);
    api.route('/', workflowsRoutes);
    api.route('/', overviewRoutes);
    api.route('/', metricsRoutes);
    api.route('/', notificationsRoutes);
    api.route('/', usersRoutes);
    api.route('/', membersRoutes);
    api.route('/', authRoutes);
    api.route('/', integrationsRoutes);
    api.route('/', appsRoutes);
    api.route('/', slackRoutes);
    api.route('/', mcpRoutes);
    api.route('/', githubAppRoutes);
    api.route('/', importRoutes);
    return api;
};

export const createApp = (): Hono<AppEnv> => {
    const logger = getLogger();
    logger.info('Setting up routes');

    const app = createBaseApp();
    // Powertools compressed every content type above the threshold
    app.use(compress({encoding: 'gzip', threshold: 1024, contentTypeFilter: () => true}));
    app.use(setContentLength);
    app.use(corsFor(config.get('corsOrigins')));
    app.use(authenticate);
    app.use(originCheck);

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
