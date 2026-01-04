import {getLogger} from '@/logger';
import analyticsRoutes from '@/router/routes/analytics';
import authCongitoRoutes from '@/router/routes/authCongito';
import feFailover from '@/router/routes/feFailover';
import importRoutes from '@/router/routes/import';
import integrationsRoutes from '@/router/routes/integrations';
import notificationsRoutes from '@/router/routes/notifications';
import jobsRoutes from '@/router/routes/workflows';
import {Router} from '@aws-lambda-powertools/event-handler/http';
import {compress, cors} from '@aws-lambda-powertools/event-handler/http/middleware';

const corsOriginsEnv = process.env.CORS_ORIGINS;
if (!corsOriginsEnv) {
    throw new Error('CORS_ORIGINS environment variable is not set');
}

// Setup logs - these run at module initialization before any requests
const logger = getLogger();
logger.info('Setting up routes');

const app = new Router({logger});
app.use(compress());
app.use(
    cors({
        origin: JSON.parse(corsOriginsEnv),
        maxAge: 300,
    }),
);

app.includeRouter(authCongitoRoutes);
app.includeRouter(importRoutes);
app.includeRouter(feFailover);
app.includeRouter(notificationsRoutes);
app.includeRouter(jobsRoutes);
app.includeRouter(integrationsRoutes);
app.includeRouter(analyticsRoutes);

logger.info('Routes setup completed');

export default app;
