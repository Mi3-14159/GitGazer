import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {createHandle, deleteHandle, installApp, listApps, listSlackChannels, uninstallApp, updateHandle} from '@/domains/apps/apps.controller';
import {buildSlackInstallRedirect} from '@/domains/apps/slack-install';
import {requireRole} from '@/shared/middleware/require-role';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {AppRequestContext} from '@gitgazer/backend-core/types';
import {hasRole, isIntegrationAppType} from '@gitgazer/db/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

const readBody = async (reqCtx: AppRequestContext): Promise<Record<string, unknown>> => {
    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }
    let body: unknown;
    try {
        body = await reqCtx.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new BadRequestError('Invalid request body');
    }
    return body as Record<string, unknown>;
};

const json = (body: unknown, status: number = HttpStatusCodes.OK) =>
    new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

router.get('/api/integrations/:integrationId/apps', [addUserIntegrationsToCtx, requireRole('viewer')], async (reqCtx: AppRequestContext) => {
    const integrationId = reqCtx.params.integrationId;
    const role = reqCtx.appContext?.integrationRoles?.[integrationId];
    const apps = await listApps({
        integrationId,
        integrationIds: reqCtx.appContext?.integrations ?? [],
        canSeeSecrets: role !== undefined && hasRole(role, 'admin'),
    });
    return json(apps);
});

router.post('/api/integrations/:integrationId/apps', [addUserIntegrationsToCtx, requireRole('admin')], async (reqCtx: AppRequestContext) => {
    const body = await readBody(reqCtx);
    if (!isIntegrationAppType(body.type)) {
        throw new BadRequestError('Invalid app type');
    }
    const app = await installApp({
        integrationId: reqCtx.params.integrationId,
        integrationIds: reqCtx.appContext?.integrations ?? [],
        type: body.type,
    });
    return json(app, HttpStatusCodes.CREATED);
});

router.get(
    '/api/integrations/:integrationId/apps/slack/install',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        const {location, stateCookie} = buildSlackInstallRedirect({
            integrationId: reqCtx.params.integrationId,
            userId: reqCtx.appContext!.userId,
            redirectUrl: (reqCtx.event as APIGatewayProxyEventV2).queryStringParameters?.redirect_url,
        });
        return new Response(null, {status: HttpStatusCodes.FOUND, headers: {Location: location, 'Set-Cookie': stateCookie}});
    },
);

router.get(
    '/api/integrations/:integrationId/apps/:appId/slack/channels',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        const channels = await listSlackChannels({
            integrationId: reqCtx.params.integrationId,
            integrationIds: reqCtx.appContext?.integrations ?? [],
            appId: reqCtx.params.appId,
        });
        return json(channels);
    },
);

router.delete('/api/integrations/:integrationId/apps/:appId', [addUserIntegrationsToCtx, requireRole('admin')], async (reqCtx: AppRequestContext) => {
    await uninstallApp({
        integrationId: reqCtx.params.integrationId,
        integrationIds: reqCtx.appContext?.integrations ?? [],
        appId: reqCtx.params.appId,
    });
    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

router.post(
    '/api/integrations/:integrationId/apps/:appId/handles',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        const body = await readBody(reqCtx);
        const scope = {
            integrationId: reqCtx.params.integrationId,
            integrationIds: reqCtx.appContext?.integrations ?? [],
            appId: reqCtx.params.appId,
        };
        let handle;
        if (typeof body.channelId === 'string') {
            if (body.name !== undefined && typeof body.name !== 'string') {
                throw new BadRequestError('name must be a string');
            }
            handle = await createHandle({...scope, channelId: body.channelId, name: body.name as string | undefined});
        } else {
            if (typeof body.name !== 'string' || typeof body.url !== 'string') {
                throw new BadRequestError('name and url are required');
            }
            handle = await createHandle({...scope, name: body.name, url: body.url});
        }
        return json(handle, HttpStatusCodes.CREATED);
    },
);

router.patch(
    '/api/integrations/:integrationId/handles/:handleId',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        const body = await readBody(reqCtx);
        if ((body.name !== undefined && typeof body.name !== 'string') || (body.url !== undefined && typeof body.url !== 'string')) {
            throw new BadRequestError('name and url must be strings');
        }
        const handle = await updateHandle({
            integrationId: reqCtx.params.integrationId,
            integrationIds: reqCtx.appContext?.integrations ?? [],
            handleId: reqCtx.params.handleId,
            name: body.name as string | undefined,
            url: body.url as string | undefined,
        });
        return json(handle);
    },
);

router.delete(
    '/api/integrations/:integrationId/handles/:handleId',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        await deleteHandle({
            integrationId: reqCtx.params.integrationId,
            integrationIds: reqCtx.appContext?.integrations ?? [],
            handleId: reqCtx.params.handleId,
        });
        return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
    },
);

export default router;
