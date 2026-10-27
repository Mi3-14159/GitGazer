// Template: apps/lambdas/api/src/domains/<domain>/<domain>.routes.ts
// Rename `things` / `Thing`. Register in createApiRouter() in apps/lambdas/api/src/app.ts via api.route('/integrations/:integrationId/things', thingsRoutes); paths are relative to that mount.
// The global chain (compress → setContentLength → cors → authenticate → originCheck) is applied by createApp — do not re-add it.

import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {createThing, getThings} from '@/domains/things/things.controller';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError} from '@/shared/errors';
import {requireRole} from '@/shared/middleware/require-role';
import {Hono} from 'hono';
import type {BlankSchema} from 'hono/types';

// The third generic types the :integrationId of the mount path for c.req.param.
const router = new Hono<AppEnv, BlankSchema, '/integrations/:integrationId/things'>();

// Gate every route with requireRole(...), which reads the :integrationId path parameter.
// Roles: 'viewer' | 'member' | 'admin' | 'owner'.
router.get('/', addUserIntegrationsToCtx, requireRole('viewer'), async (c) => {
    return c.json(await getThings({integrationIds: [c.req.param('integrationId')]}));
});

router.post('/', addUserIntegrationsToCtx, requireRole('admin'), async (c) => {
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
