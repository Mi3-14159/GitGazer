import {getIndexHtml} from '@/clients/s3';
import {getLogger} from '../../logger';
import {Router} from '../router';

const logger = getLogger();
const router = new Router();

router.get('/fe-failover/{proxy+}', async (_event) => {
    logger.info('Handling request for /fe-failover/{proxy+}', _event.rawPath);

    const indexHtml = await getIndexHtml();
    const body = await indexHtml.Body?.transformToString();

    return {
        statusCode: 200,
        body,
        headers: {
            ...(indexHtml.ContentType ? {'Content-Type': indexHtml.ContentType} : {}),
            ...(indexHtml.CacheControl ? {'Cache-Control': indexHtml.CacheControl} : {}),
        },
    };
});

export default router;
