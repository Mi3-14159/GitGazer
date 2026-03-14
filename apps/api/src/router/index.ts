import config from '@/config';
import {getLogger} from '@/logger';
import {authenticate} from '@/router/middlewares/authentication';
import authCognitoRoutes from '@/router/routes/authCognito';
import feFailover from '@/router/routes/feFailover';
import githubAppRoutes from '@/router/routes/githubApp';
import importRoutes from '@/router/routes/import';
import integrationsRoutes from '@/router/routes/integrations';
import metricsRoutes from '@/router/routes/metrics';
import notificationsRoutes from '@/router/routes/notifications';
import overviewRoutes from '@/router/routes/overview';
import workflowsRoutes from '@/router/routes/workflows';
import {Router} from '@aws-lambda-powertools/event-handler/http';
import {compress, cors} from '@aws-lambda-powertools/event-handler/http/middleware';

export const createApp = (): Router => {
    const logger = getLogger();
    logger.info('Setting up routes');

    const corsOrigins = JSON.parse(config.get('corsOrigins')) as string[];

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

    app.includeRouter(authCognitoRoutes);
    app.includeRouter(githubAppRoutes);
    app.includeRouter(importRoutes);
    app.includeRouter(feFailover);
    app.includeRouter(notificationsRoutes);
    app.includeRouter(workflowsRoutes);
    app.includeRouter(overviewRoutes);
    app.includeRouter(integrationsRoutes);
    app.includeRouter(metricsRoutes);

    logger.info('Routes setup completed');

    return app;
};
