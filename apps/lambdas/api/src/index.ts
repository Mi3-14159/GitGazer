import '@gitgazer/backend-core/bootstrap';
import {startServer} from '@/server';
import {getLogger} from '@gitgazer/backend-core/logger';

const logger = getLogger();

startServer().catch((error) => {
    logger.error('Server failed to start', {error});
    process.exit(1);
});
