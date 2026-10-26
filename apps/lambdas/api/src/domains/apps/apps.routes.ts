import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {createHandle, deleteHandle, installApp, listApps, listSlackChannels, uninstallApp, updateHandle} from '@/domains/apps/apps.controller';
import {buildSlackInstallRedirect} from '@/domains/apps/slack-install';
import {listMoveCandidates, moveWebhookHandles, type WebhookMove} from '@/domains/apps/slack-move';
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
    '/api/integrations/:integrationId/apps/slack/move-candidates',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        const candidates = await listMoveCandidates({
            integrationId: reqCtx.params.integrationId,
            integrationIds: reqCtx.appContext?.integrations ?? [],
        });
        return json(candidates);
    },
);

router.post(
    '/api/integrations/:integrationId/apps/slack/move',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        const {moves} = await readBody(reqCtx);
        const isMove = (m: unknown): m is WebhookMove =>
            typeof m === 'object' &&
            m !== null &&
            typeof (m as WebhookMove).webhookHandleId === 'string' &&
            typeof (m as WebhookMove).channelId === 'string';
        if (!Array.isArray(moves) || !moves.every(isMove)) {
            throw new BadRequestError('moves must be a list of webhookHandleId and channelId');
        }
        const result = await moveWebhookHandles({
            integrationId: reqCtx.params.integrationId,
            integrationIds: reqCtx.appContext?.integrations ?? [],
            moves,
        });
        return json(result);
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
        if (typeof body.channelId === 'string') {
            return json(await createHandle({...scope, channelId: body.channelId}), HttpStatusCodes.CREATED);
        }
        if (typeof body.name !== 'string' || typeof body.url !== 'string') {
            throw new BadRequestError('name and url are required');
        }
        return json(await createHandle({...scope, name: body.name, url: body.url}), HttpStatusCodes.CREATED);
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
