import {getIndexHtml} from '@/clients/s3';
import {Router} from '../router';

const router = new Router();

router.get('/fe-failover/{proxy+}', async (_event) => {
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
