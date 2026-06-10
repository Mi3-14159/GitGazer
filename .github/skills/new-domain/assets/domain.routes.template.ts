// Template: apps/api/src/domains/<domain>/<domain>.routes.ts
// Rename `things` / `Thing`. Register in apps/api/src/shared/router/index.ts via app.includeRouter(thingsRoutes).
// The global chain (compress → cors → authenticate → originCheck) is applied by createApp — do not re-add it.

import {createThing, getThings} from '@/domains/things/things.controller';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {requireRole} from '@/shared/middleware/require-role';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';

const router = new Router();

router.get('/api/things', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const things = await getThings({integrationIds});

    return new Response(JSON.stringify(things), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

// State-changing routes: gate with requireRole(...). Roles: 'viewer' | 'member' | 'admin' | 'owner'.
router.post('/api/things', [addUserIntegrationsToCtx, requireRole('admin')], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let body;
    try {
        body = await reqCtx.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    if (!body.label || typeof body.label !== 'string') {
        throw new BadRequestError('Invalid label');
    }

    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const thing = await createThing({label: body.label, integrationIds});

    return new Response(JSON.stringify(thing), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

export default router;
