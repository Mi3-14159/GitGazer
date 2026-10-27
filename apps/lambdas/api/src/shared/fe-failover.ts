import {getIndexHtml} from '@/shared/clients/s3.client';
import type {AppEnv} from '@/shared/hono/env';
import {HttpStatusCodes} from '@/shared/errors';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

router.get('/fe-failover/:path{.+}', async () => {
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
