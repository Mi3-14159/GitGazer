import {getOverview} from '@/domains/overview/overview.controller';
import {addUserIntegrationsToCtxHono} from '@/domains/integrations/integrations.middleware';
import {parseDateFilters} from '@/shared/helpers/filters';
import type {AppEnv} from '@/shared/hono/env';
import {HttpStatusCodes} from '@/shared/hono/http-errors';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

router.get('/api/overview', addUserIntegrationsToCtxHono, async (c) => {
    const integrationIds = c.var.appContext?.integrations ?? [];
    if (!integrationIds || integrationIds.length === 0) {
        return new Response(JSON.stringify({message: 'No integrations found for user'}), {
            status: HttpStatusCodes.OK,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const filters = parseDateFilters(c.req.query());

    const overview = await getOverview({
        integrationIds,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    return new Response(JSON.stringify(overview), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

export default router;
