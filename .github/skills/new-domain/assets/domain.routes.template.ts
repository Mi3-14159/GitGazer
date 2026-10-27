// Template: apps/lambdas/api/src/domains/<domain>/<domain>.routes.ts
// Rename `things` / `Thing`. Register in createApp() in apps/lambdas/api/src/app.ts via app.route('/', thingsRoutes).
// The global chain (compress → setContentLength → cors → authenticate → originCheck) is applied by createApp — do not re-add it.

import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {createThing, getThings} from '@/domains/things/things.controller';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError} from '@/shared/hono/http-errors';
import {requireRole} from '@/shared/middleware/require-role';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

router.get('/api/things', addUserIntegrationsToCtx, async (c) => {
    const integrationIds = c.var.appContext?.integrations ?? [];
    return c.json(await getThings({integrationIds}));
});

// State-changing routes: gate with requireRole(...), which reads the :integrationId path parameter.
// Roles: 'viewer' | 'member' | 'admin' | 'owner'.
router.post('/api/integrations/:integrationId/things', addUserIntegrationsToCtx, requireRole('admin'), async (c) => {
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
