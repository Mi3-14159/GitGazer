import {getLogger} from '../logger';
import {lowercaseHeaders} from './middlewares/lowercaseHeaders';
import {Router} from './router';
import importRoutes from './routes/import';

const logger = getLogger();
const app = new Router();

logger.info({msg: 'Setting up routes'});

// Option 1: Register auth middleware globally for all routes
app.middleware(lowercaseHeaders);

// Option 2: Use route-specific middleware (as implemented in import route)
app.use(importRoutes);

logger.info({msg: 'Routes setup completed'});

export default app;
