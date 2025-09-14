import {getLogger} from '../logger';
import {extractCognitoGroups} from './middlewares/authorization';
import {lowercaseHeaders} from './middlewares/lowercaseHeaders';
import {Router} from './router';
import authCongitoRoutes from './routes/authCongito';
import feFailover from './routes/feFailover';
import importRoutes from './routes/import';
import integrationsRoutes from './routes/integrations';
import jobsRoutes from './routes/jobs';
import notificationsRoutes from './routes/notifications';

// Setup logs - these run at module initialization before any requests
const logger = getLogger();
logger.info({msg: 'Setting up routes'});

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

logger.info({msg: 'Routes setup completed', routes: Array.from(app.routeKeys.keys())});

export default app;
