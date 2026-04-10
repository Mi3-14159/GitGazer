import authRoutes from '@/domains/auth/auth.routes';
import eventLogRoutes from '@/domains/event-log/event-log.routes';
import githubAppRoutes from '@/domains/github-app/github-app.routes';
import integrationsRoutes from '@/domains/integrations/integrations.routes';
import membersRoutes from '@/domains/members/members.routes';
import metricsRoutes from '@/domains/metrics/metrics.routes';
import notificationsRoutes from '@/domains/notifications/notifications.routes';
import overviewRoutes from '@/domains/overview/overview.routes';
import usersRoutes from '@/domains/users/users.routes';
import importRoutes from '@/domains/webhooks/webhooks.routes';
import workflowsRoutes from '@/domains/workflows/workflows.routes';
import config from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {authenticate} from '@/shared/middleware/authentication';
import {originCheck} from '@/shared/middleware/origin-check';
import feFailover from '@/shared/router/feFailover';
import {Router} from '@aws-lambda-powertools/event-handler/http';
import {compress, cors} from '@aws-lambda-powertools/event-handler/http/middleware';

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
    app.includeRouter(eventLogRoutes);
    app.includeRouter(workflowsRoutes);
    app.includeRouter(overviewRoutes);
    app.includeRouter(integrationsRoutes);
    app.includeRouter(membersRoutes);
    app.includeRouter(metricsRoutes);

    logger.info('Routes setup completed');

    return app;
};
