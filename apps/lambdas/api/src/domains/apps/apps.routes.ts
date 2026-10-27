import {addUserIntegrationsToCtxHono} from '@/domains/integrations/integrations.middleware';
import {createHandle, deleteHandle, installApp, listApps, listSlackChannels, uninstallApp, updateHandle} from '@/domains/apps/apps.controller';
import {buildSlackInstallRedirect} from '@/domains/apps/slack-install';
import {listMoveCandidates, moveWebhookHandles, type WebhookMove} from '@/domains/apps/slack-move';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, HttpStatusCodes} from '@/shared/hono/http-errors';
import {requireRole} from '@/shared/hono/require-role';
import {hasRole, isIntegrationAppType} from '@gitgazer/db/types';
import type {Context} from 'hono';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

const readBody = async (c: Context<AppEnv>): Promise<Record<string, unknown>> => {
    const rawBody = await c.req.text();
    if (!rawBody) {
        throw new BadRequestError('Missing request body');
    }
    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        throw new BadRequestError('Invalid request body');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new BadRequestError('Invalid request body');
    }
    return body as Record<string, unknown>;
};

router.get('/api/integrations/:integrationId/apps', addUserIntegrationsToCtxHono, requireRole('viewer'), async (c) => {
    const integrationId = c.req.param('integrationId');
    const role = c.var.appContext?.integrationRoles?.[integrationId];
    const apps = await listApps({
        integrationId,
        integrationIds: c.var.appContext?.integrations ?? [],
        canSeeSecrets: role !== undefined && hasRole(role, 'admin'),
    });
    return c.json(apps);
});

router.post('/api/integrations/:integrationId/apps', addUserIntegrationsToCtxHono, requireRole('admin'), async (c) => {
    const body = await readBody(c);
    if (!isIntegrationAppType(body.type)) {
        throw new BadRequestError('Invalid app type');
    }
    const app = await installApp({
        integrationId: c.req.param('integrationId'),
        integrationIds: c.var.appContext?.integrations ?? [],
        type: body.type,
    });
    return c.json(app, HttpStatusCodes.CREATED);
});

router.get('/api/integrations/:integrationId/apps/slack/install', addUserIntegrationsToCtxHono, requireRole('admin'), async (c) => {
    const {location, stateCookie} = buildSlackInstallRedirect({
        integrationId: c.req.param('integrationId'),
        userId: c.var.appContext!.userId,
        redirectUrl: c.req.query('redirect_url'),
    });
    return new Response(null, {status: HttpStatusCodes.FOUND, headers: {Location: location, 'Set-Cookie': stateCookie}});
});

router.get('/api/integrations/:integrationId/apps/slack/move-candidates', addUserIntegrationsToCtxHono, requireRole('admin'), async (c) => {
    const candidates = await listMoveCandidates({
        integrationId: c.req.param('integrationId'),
        integrationIds: c.var.appContext?.integrations ?? [],
    });
    return c.json(candidates);
});

router.post('/api/integrations/:integrationId/apps/slack/move', addUserIntegrationsToCtxHono, requireRole('admin'), async (c) => {
    const {moves} = await readBody(c);
    const isMove = (m: unknown): m is WebhookMove =>
        typeof m === 'object' &&
        m !== null &&
        typeof (m as WebhookMove).webhookHandleId === 'string' &&
        typeof (m as WebhookMove).channelId === 'string';
    if (!Array.isArray(moves) || !moves.every(isMove)) {
        throw new BadRequestError('moves must be a list of webhookHandleId and channelId');
    }
    const result = await moveWebhookHandles({
        integrationId: c.req.param('integrationId'),
        integrationIds: c.var.appContext?.integrations ?? [],
        moves,
    });
    return c.json(result);
});

router.get('/api/integrations/:integrationId/apps/:appId/slack/channels', addUserIntegrationsToCtxHono, requireRole('admin'), async (c) => {
    const channels = await listSlackChannels({
        integrationId: c.req.param('integrationId'),
        integrationIds: c.var.appContext?.integrations ?? [],
        appId: c.req.param('appId'),
    });
    return c.json(channels);
});

router.delete('/api/integrations/:integrationId/apps/:appId', addUserIntegrationsToCtxHono, requireRole('admin'), async (c) => {
    await uninstallApp({
        integrationId: c.req.param('integrationId'),
        integrationIds: c.var.appContext?.integrations ?? [],
        appId: c.req.param('appId'),
    });
    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

router.post('/api/integrations/:integrationId/apps/:appId/handles', addUserIntegrationsToCtxHono, requireRole('admin'), async (c) => {
    const body = await readBody(c);
    const scope = {
        integrationId: c.req.param('integrationId'),
        integrationIds: c.var.appContext?.integrations ?? [],
        appId: c.req.param('appId'),
    };
    if (typeof body.channelId === 'string') {
        return c.json(await createHandle({...scope, channelId: body.channelId}), HttpStatusCodes.CREATED);
    }
    if (typeof body.name !== 'string' || typeof body.url !== 'string') {
        throw new BadRequestError('name and url are required');
    }
    return c.json(await createHandle({...scope, name: body.name, url: body.url}), HttpStatusCodes.CREATED);
});

router.patch('/api/integrations/:integrationId/handles/:handleId', addUserIntegrationsToCtxHono, requireRole('admin'), async (c) => {
    const body = await readBody(c);
    if ((body.name !== undefined && typeof body.name !== 'string') || (body.url !== undefined && typeof body.url !== 'string')) {
        throw new BadRequestError('name and url must be strings');
    }
    const handle = await updateHandle({
        integrationId: c.req.param('integrationId'),
        integrationIds: c.var.appContext?.integrations ?? [],
        handleId: c.req.param('handleId'),
        name: body.name as string | undefined,
        url: body.url as string | undefined,
    });
    return c.json(handle);
});

router.delete('/api/integrations/:integrationId/handles/:handleId', addUserIntegrationsToCtxHono, requireRole('admin'), async (c) => {
    await deleteHandle({
        integrationId: c.req.param('integrationId'),
        integrationIds: c.var.appContext?.integrations ?? [],
        handleId: c.req.param('handleId'),
    });
    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

export default router;
