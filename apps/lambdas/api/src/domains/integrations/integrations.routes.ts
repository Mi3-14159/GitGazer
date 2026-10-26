import {createEventLogEntry} from '@gitgazer/backend-services/event-log.controller';
import {unlinkInstallation} from '@/domains/github-app/unlink-installation';
import {provisionWebhooks, updateAllWebhookEvents} from '@/domains/github-app/webhook-provisioning';
import {
    deleteIntegration,
    getIntegrations,
    rotateSecret,
    updateOrgSyncSettings,
    upsertIntegration,
} from '@/domains/integrations/integrations.controller';
import {getGithubSettings} from '@/domains/apps/github-settings';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {resolveAndAssignOrgMembers} from '@gitgazer/backend-services/org-member-resolver';
import {getLogger} from '@gitgazer/backend-core/logger';
import {ConflictError} from '@/shared/errors';
import {requireRole} from '@/shared/middleware/require-role';
import {AppRequestContext} from '@gitgazer/backend-core/types';
import {BadRequestError, ForbiddenError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {db} from '@gitgazer/db/client';
import {users} from '@gitgazer/db/schema/gitgazer';
import {githubAppInstallations} from '@gitgazer/db/schema/github/workflows';
import {GITHUB_APP_WEBHOOK_EVENTS, isOrgSyncDefaultRole, ORG_SYNC_DEFAULT_ROLES, type IntegrationWithRole} from '@gitgazer/db/types';
import {and, eq, isNull} from 'drizzle-orm';

const router = new Router();

router.get('/api/integrations', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const integrationRoles = reqCtx.appContext?.integrationRoles ?? {};
    const integrations = await getIntegrations({
        integrationIds: integrationIds,
    });

    const integrationsWithRoles: IntegrationWithRole[] = integrations.map((integration) => ({
        ...integration,
        role: integrationRoles[integration.integrationId] ?? 'viewer',
    }));

    return new Response(JSON.stringify(integrationsWithRoles), {
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

    // Installation ids are guessable, so only the GitHub user who installed it may claim it
    const userId = reqCtx.appContext?.userId!;
    const [user] = await db.select({githubId: users.githubId}).from(users).where(eq(users.id, userId));
    const githubId = user?.githubId;
    const installedByUser =
        githubId != null && (githubId === installation.senderId || (installation.accountType === 'User' && githubId === installation.accountId));
    if (!installedByUser) {
        logger.warn('Rejected linking a GitHub App installation the user did not install', {integrationId, installationId, userId});
        throw new ForbiddenError('Only the GitHub user who installed the GitHub App can link this installation');
    }

    if (installation.integrationId) {
        throw new BadRequestError('Installation is already linked to an integration');
    }

    // Not withRlsTransaction: the writer's tenant policy hides the still-unlinked installation row.
    // The FOR SHARE lock makes a concurrent GitHub app removal wait for this link, so its re-check sees it.
    const githubSettings = await db.transaction(async (tx) => {
        const settings = await getGithubSettings(tx, integrationId, 'share');
        if (!settings) {
            throw new ConflictError('Install the GitHub app first');
        }

        // The UPDATE only matches while integration_id IS NULL; if a racing request
        // linked it first, 0 rows are returned and we reject instead of overwriting.
        // Events are (re)set here so installations created before a new event type was
        // supported still subscribe to everything on link.
        const linked = await tx
            .update(githubAppInstallations)
            .set({integrationId, webhookEvents: [...GITHUB_APP_WEBHOOK_EVENTS], updatedAt: new Date()})
            .where(and(eq(githubAppInstallations.installationId, installationId), isNull(githubAppInstallations.integrationId)))
            .returning({installationId: githubAppInstallations.installationId});

        if (linked.length === 0) {
            throw new BadRequestError('Installation is already linked to an integration');
        }
        return settings;
    });

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

    // Auto-add org members to the integration (Organization installations only)
    let orgSyncResult = {matched: 0, unmatched: 0};
    if (installation.accountType === 'Organization') {
        try {
            orgSyncResult = await resolveAndAssignOrgMembers({
                integrationId,
                installationId,
                role: githubSettings.orgSyncDefaultRole,
                accountLogin: installation.accountLogin,
            });
        } catch (error) {
            logger.error('Failed to auto-add org members', {error, integrationId, installationId});
        }
    }

    return {
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        webhookCount,
        orgSync: orgSyncResult,
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

        await unlinkInstallation(integrationId, installationId);

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

        const allowedEvents: readonly string[] = GITHUB_APP_WEBHOOK_EVENTS;
        if (!Array.isArray(requestBody.events) || !requestBody.events.every((e: unknown) => typeof e === 'string' && allowedEvents.includes(e))) {
            throw new BadRequestError(`Invalid events. Allowed: ${allowedEvents.join(', ')}`);
        }

        try {
            await updateAllWebhookEvents(integrationId, installationId, requestBody.events);
        } catch (error) {
            getLogger().error('Failed to update webhook events', {error});
            await createEventLogEntry({
                integrationId,
                category: 'integration',
                type: 'failure',
                title: 'Webhook events update failed',
                message: `Failed to update subscribed webhook events for installation ${installationId}`,
                metadata: {integrationId, installationId, webhookEvents: requestBody.events},
            });
            throw error;
        }

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

router.patch(
    '/api/integrations/:integrationId/org-sync-settings',
    [addUserIntegrationsToCtx, requireRole('admin')],
    async (reqCtx: AppRequestContext) => {
        const integrationId = reqCtx.params.integrationId;
        const integrationIds = reqCtx.appContext?.integrations ?? [];

        if (!reqCtx.event.body) {
            throw new BadRequestError('Missing request body');
        }

        let body;
        try {
            body = await reqCtx.req.json();
        } catch {
            throw new BadRequestError('Invalid request body');
        }

        if (!body.defaultRole || !isOrgSyncDefaultRole(body.defaultRole)) {
            throw new BadRequestError(`Invalid defaultRole. Allowed: ${ORG_SYNC_DEFAULT_ROLES.join(', ')}`);
        }

        await updateOrgSyncSettings({
            integrationId,
            defaultRole: body.defaultRole,
            integrationIds,
        });

        return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
    },
);

export default router;
