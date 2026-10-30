import {createEventLogEntry} from '@gitgazer/backend-services/event-log.controller';
import {unlinkInstallation} from '@/domains/github-app/unlink-installation';
import {provisionWebhooks, updateAllWebhookEvents} from '@gitgazer/backend-services/github-app/webhook-provisioning';
import {
    deleteIntegration,
    getIntegrations,
    rotateSecret,
    updateOrgSyncSettings,
    upsertIntegration,
} from '@/domains/integrations/integrations.controller';
import {getGithubSettings} from '@gitgazer/backend-services/github-app/github-settings';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {resolveAndAssignOrgMembers} from '@gitgazer/backend-services/org-member-resolver';
import {getLogger} from '@gitgazer/backend-core/logger';
import {BadRequestError, ConflictError, ForbiddenError, HttpStatusCodes, NotFoundError} from '@/shared/errors';
import type {AppEnv} from '@/shared/hono/env';
import {db, withRlsTransaction} from '@gitgazer/db/client';
import {users} from '@gitgazer/db/schema/gitgazer';
import {githubAppInstallations} from '@gitgazer/db/schema/github/workflows';
import {GITHUB_APP_WEBHOOK_EVENTS, isOrgSyncDefaultRole, ORG_SYNC_DEFAULT_ROLES, type IntegrationWithRole} from '@gitgazer/db/types';
import {and, eq, isNull} from 'drizzle-orm';
import type {Context} from 'hono';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

const readJsonBody = async (c: Context<AppEnv>) => {
    const rawBody = await c.req.text();
    if (!rawBody) {
        throw new BadRequestError('Missing request body');
    }
    try {
        return JSON.parse(rawBody);
    } catch {
        throw new BadRequestError('Invalid request body');
    }
};

router.get('/', addUserIntegrationsToCtx, async (c) => {
    const integrationIds = c.var.appContext?.integrations ?? [];
    const integrationRoles = c.var.appContext?.integrationRoles ?? {};
    const integrations = await getIntegrations({
        integrationIds: integrationIds,
    });

    const integrationsWithRoles: IntegrationWithRole[] = integrations.map((integration) => ({
        ...integration,
        role: integrationRoles[integration.integrationId] ?? 'viewer',
    }));

    return c.json(integrationsWithRoles);
});

router.post('/', addUserIntegrationsToCtx, async (c) => {
    const requestBody = await readJsonBody(c);

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        throw new BadRequestError('Invalid label');
    }

    const {userId, integrations = []} = c.var.appContext ?? {};

    const integration = await upsertIntegration({
        label: requestBody.label,
        userId,
        integrationIds: integrations,
    });

    return c.json(integration);
});

router.put('/:integrationId', addUserIntegrationsToCtx, async (c) => {
    const requestBody = await readJsonBody(c);

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        throw new BadRequestError('Invalid label');
    }

    const integration = c.var.appContext?.integrations ?? [];

    const updatedIntegration = await upsertIntegration({
        id: c.req.param('integrationId'),
        label: requestBody.label,
        integrationIds: integration,
    });

    return c.json(updatedIntegration);
});

router.delete('/:integrationId', addUserIntegrationsToCtx, async (c) => {
    const integrationIds = c.var.appContext?.integrations ?? [];
    await deleteIntegration(c.req.param('integrationId'), integrationIds, c.var.appContext?.userId!);

    return new Response(null, {
        status: HttpStatusCodes.NO_CONTENT,
    });
});

router.post('/:integrationId/rotate-secret', addUserIntegrationsToCtx, async (c) => {
    const integrationId = c.req.param('integrationId');
    const integrationIds = c.var.appContext?.integrations ?? [];

    const integration = await rotateSecret({integrationId, integrationIds});

    return c.json(integration);
});

router.post('/:integrationId/github-app', addUserIntegrationsToCtx, async (c) => {
    const logger = getLogger();
    const integrationId = c.req.param('integrationId');

    const requestBody = await readJsonBody(c);

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
    const userId = c.var.appContext?.userId!;
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

    return c.json({
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        webhookCount,
        orgSync: orgSyncResult,
    });
});

router.delete('/:integrationId/github-app/:installationId', addUserIntegrationsToCtx, async (c) => {
    const integrationId = c.req.param('integrationId');
    const installationId = parseInt(c.req.param('installationId'), 10);

    if (isNaN(installationId)) {
        throw new BadRequestError('Invalid installation ID');
    }

    await unlinkInstallation(integrationId, installationId);

    return new Response(null, {
        status: HttpStatusCodes.NO_CONTENT,
    });
});

router.patch('/:integrationId/github-app/:installationId/events', addUserIntegrationsToCtx, async (c) => {
    const integrationId = c.req.param('integrationId');
    const installationId = parseInt(c.req.param('installationId'), 10);

    if (isNaN(installationId)) {
        throw new BadRequestError('Invalid installation ID');
    }

    const requestBody = await readJsonBody(c);

    const allowedEvents: readonly string[] = GITHUB_APP_WEBHOOK_EVENTS;
    if (!Array.isArray(requestBody.events) || !requestBody.events.every((e: unknown) => typeof e === 'string' && allowedEvents.includes(e))) {
        throw new BadRequestError(`Invalid events. Allowed: ${allowedEvents.join(', ')}`);
    }

    const linked = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: (tx) =>
            tx
                .select({installationId: githubAppInstallations.installationId})
                .from(githubAppInstallations)
                .where(and(eq(githubAppInstallations.integrationId, integrationId), eq(githubAppInstallations.installationId, installationId))),
    });
    if (linked.length === 0) {
        throw new NotFoundError('Installation not found');
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

    return c.json({events: requestBody.events});
});

router.patch('/:integrationId/org-sync-settings', addUserIntegrationsToCtx, async (c) => {
    const integrationId = c.req.param('integrationId');
    const integrationIds = c.var.appContext?.integrations ?? [];

    const body = await readJsonBody(c);

    if (!body.defaultRole || !isOrgSyncDefaultRole(body.defaultRole)) {
        throw new BadRequestError(`Invalid defaultRole. Allowed: ${ORG_SYNC_DEFAULT_ROLES.join(', ')}`);
    }

    await updateOrgSyncSettings({
        integrationId,
        defaultRole: body.defaultRole,
        integrationIds,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

export default router;
