import {getIndexHtml} from '@/shared/clients/s3.client';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';

const router = new Router();

router.get(/\/fe-failover\/.+/, async () => {
    const indexHtml = await getIndexHtml();
    const body = await indexHtml.Body?.transformToString();

    return new Response(body, {
        status: HttpStatusCodes.OK,
        headers: {
            ...(indexHtml.ContentType ? {'Content-Type': indexHtml.ContentType} : {}),
            ...(indexHtml.CacheControl ? {'Cache-Control': indexHtml.CacheControl} : {}),
        },
    });
});

export const publicPrefixes = ['/fe-failover/'] as const;

export default router;
