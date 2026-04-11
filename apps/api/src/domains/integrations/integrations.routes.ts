import {createEventLogEntry} from '@/domains/event-log/event-log.controller';
import {deprovisionAllWebhooks, provisionWebhooks, updateAllWebhookEvents} from '@/domains/github-app/webhook-provisioning';
import {deleteIntegration, getIntegrations, rotateSecret, upsertIntegration} from '@/domains/integrations/integrations.controller';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {getLogger} from '@/shared/logger';
import {requireRole} from '@/shared/middleware/require-role';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {db} from '@gitgazer/db/client';
import {githubAppInstallations} from '@gitgazer/db/schema/github/workflows';
import {and, eq} from 'drizzle-orm';

const router = new Router();

router.get('/api/integrations', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const integrations = await getIntegrations({
        integrationIds: integrationIds,
    });

    return new Response(JSON.stringify(integrations), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

router.post('/api/integrations', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        throw new BadRequestError('Invalid label');
    }

    const {userId, integrations = []} = reqCtx.appContext ?? {};

    const integration = await upsertIntegration({
        label: requestBody.label,
        userId,
        integrationIds: integrations,
    });

    return new Response(JSON.stringify(integration), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

router.put('/api/integrations/:integrationId', [addUserIntegrationsToCtx, requireRole('admin')], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        throw new BadRequestError('Invalid label');
    }

    const integration = reqCtx.appContext?.integrations ?? [];

    const updatedIntegration = await upsertIntegration({
        id: reqCtx.params.integrationId,
        label: requestBody.label,
        integrationIds: integration,
    });

    return new Response(JSON.stringify(updatedIntegration), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

router.delete('/api/integrations/:integrationId', [addUserIntegrationsToCtx, requireRole('owner')], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    await deleteIntegration(reqCtx.params.integrationId, integrationIds, reqCtx.appContext?.userId!);

    return new Response(null, {
        status: HttpStatusCodes.NO_CONTENT,
    });
});

router.post('/api/integrations/:integrationId/rotate-secret', [addUserIntegrationsToCtx, requireRole('admin')], async (reqCtx: AppRequestContext) => {
    const integrationId = reqCtx.params.integrationId;
    const integrationIds = reqCtx.appContext?.integrations ?? [];

    const integration = await rotateSecret({integrationId, integrationIds});

    return new Response(JSON.stringify(integration), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

router.post('/api/integrations/:integrationId/github-app', [addUserIntegrationsToCtx, requireRole('admin')], async (reqCtx: AppRequestContext) => {
    const logger = getLogger();
    const integrationId = reqCtx.params.integrationId;

    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    const installationId = requestBody.installation_id;
    if (typeof installationId !== 'number') {
        throw new BadRequestError('Invalid installation_id');
    }

    // Verify installation exists and is unlinked
    const [installation] = await db.select().from(githubAppInstallations).where(eq(githubAppInstallations.installationId, installationId));

    if (!installation) {
        throw new BadRequestError('Installation not found. The GitHub App may not have been installed yet.');
    }

    if (installation.integrationId) {
        throw new BadRequestError('Installation is already linked to an integration');
    }

    // Link installation to integration
    await db
        .update(githubAppInstallations)
        .set({integrationId, updatedAt: new Date()})
        .where(eq(githubAppInstallations.installationId, installationId));

    // Provision webhooks
    let webhookCount = 0;
    try {
        webhookCount = await provisionWebhooks(integrationId, installationId);
    } catch (error) {
        logger.error('Failed to provision webhooks', {error});
        await createEventLogEntry({
            integrationId,
            category: 'integration',
            type: 'failure',
            title: 'GitHub App link failed',
            message: `Failed to link GitHub App installation for "${installation.accountLogin}"`,
            metadata: {integrationId, installationId, accountLogin: installation.accountLogin},
        });
    }

    await createEventLogEntry({
        integrationId,
        category: 'integration',
        type: 'success',
        title: 'GitHub App linked',
        message: `GitHub App installation for "${installation.accountLogin}" was linked with ${webhookCount} webhook(s) provisioned`,
        metadata: {integrationId, installationId, accountLogin: installation.accountLogin},
    });

    return {
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        webhookCount,
    };
});

router.delete(
    '/api/integrations/:integrationId/github-app/:installationId',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        const integrationId = reqCtx.params.integrationId;
        const installationId = parseInt(reqCtx.params.installationId, 10);

        if (isNaN(installationId)) {
            throw new BadRequestError('Invalid installation ID');
        }

        // Delete webhooks from GitHub (app is still installed, webhooks won't auto-delete)
        try {
            await deprovisionAllWebhooks(integrationId, installationId);
        } catch (error) {
            getLogger().error('Failed to deprovision webhooks', {error});
        }

        // Unlink installation (set integration_id back to NULL)
        await db
            .update(githubAppInstallations)
            .set({integrationId: null, updatedAt: new Date()})
            .where(and(eq(githubAppInstallations.installationId, installationId), eq(githubAppInstallations.integrationId, integrationId)));

        await createEventLogEntry({
            integrationId,
            category: 'integration',
            type: 'info',
            title: 'GitHub App unlinked',
            message: `GitHub App installation ${installationId} was unlinked and webhooks deprovisioned`,
            metadata: {integrationId, installationId},
        });

        return new Response(null, {
            status: HttpStatusCodes.NO_CONTENT,
        });
    },
);

router.patch(
    '/api/integrations/:integrationId/github-app/:installationId/events',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        const integrationId = reqCtx.params.integrationId;
        const installationId = parseInt(reqCtx.params.installationId, 10);

        if (isNaN(installationId)) {
            throw new BadRequestError('Invalid installation ID');
        }

        if (!reqCtx.event.body) {
            throw new BadRequestError('Missing request body');
        }

        let requestBody;
        try {
            requestBody = await reqCtx.req.json();
        } catch {
            throw new BadRequestError('Invalid request body');
        }

        const allowedEvents = ['workflow_run', 'workflow_job', 'pull_request', 'pull_request_review'];
        if (!Array.isArray(requestBody.events) || !requestBody.events.every((e: unknown) => typeof e === 'string' && allowedEvents.includes(e))) {
            throw new BadRequestError(`Invalid events. Allowed: ${allowedEvents.join(', ')}`);
        }

        await updateAllWebhookEvents(integrationId, installationId, requestBody.events);

        await createEventLogEntry({
            integrationId,
            category: 'integration',
            type: 'info',
            title: 'Webhook events updated',
            message: `Subscribed webhook events updated to: ${requestBody.events.join(', ')}`,
            metadata: {integrationId, installationId, webhookEvents: requestBody.events},
        });

        return {events: requestBody.events};
    },
);

export default router;
