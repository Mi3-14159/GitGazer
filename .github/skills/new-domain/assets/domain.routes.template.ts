// Template: apps/lambdas/api/src/domains/<domain>/<domain>.routes.ts
// Rename `things` / `Thing`. Register in createApiRouter() in apps/lambdas/api/src/app.ts via api.route('/integrations/:integrationId/things', thingsRoutes); paths are relative to that mount.
// The global chain (compress → setContentLength → cors → authenticate → originCheck → authorize) is applied by createApp — do not re-add it.
// Add every route to ROUTES (and its operation to OPERATIONS) in apps/lambdas/api/src/shared/permissions/table.ts, e.g.
// 'GET /api/integrations/:integrationId/things': 'thing.list' with 'thing.list': {access: {minRole: 'viewer'}}. authorize rejects a route without an entry.

import {createThing, getThings} from '@/domains/things/things.controller';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError} from '@/shared/errors';
import {Hono} from 'hono';
import type {BlankSchema} from 'hono/types';

// The third generic types the :integrationId of the mount path for c.req.param.
const router = new Hono<AppEnv, BlankSchema, '/integrations/:integrationId/things'>();

router.get('/', async (c) => {
    return c.json(await getThings({integrationIds: [c.req.param('integrationId')]}));
});

router.post('/', async (c) => {
    let body;
    try {
        body = await c.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    if (!body.label || typeof body.label !== 'string') {
        throw new BadRequestError('Invalid label');
    }

    return c.json(await createThing({label: body.label, integrationIds: [c.req.param('integrationId')]}));
});

export default router;
