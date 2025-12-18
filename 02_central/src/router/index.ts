import {getLogger} from '@/logger';
import {extractCognitoGroups} from '@/router/middlewares/authorization';
import {lowercaseHeaders} from '@/router/middlewares/lowercaseHeaders';
import {Router} from '@/router/router';
import authCongitoRoutes from '@/router/routes/authCongito';
import feFailover from '@/router/routes/feFailover';
import importRoutes from '@/router/routes/import';
import integrationsRoutes from '@/router/routes/integrations';
import jobsRoutes from '@/router/routes/jobs';
import notificationsRoutes from '@/router/routes/notifications';

// Setup logs - these run at module initialization before any requests
const logger = getLogger();
logger.info('Setting up routes');

const app = new Router();

app.middleware(lowercaseHeaders);
app.use(authCongitoRoutes);
app.use(importRoutes);
app.use(feFailover);

const authRoutes = new Router();
authRoutes.middleware(extractCognitoGroups);

authRoutes.use(notificationsRoutes);
authRoutes.use(jobsRoutes);
authRoutes.use(integrationsRoutes);

app.use(authRoutes);

logger.info('Routes setup completed', {routes: Array.from(app.routeKeys.keys())});

export default app;
