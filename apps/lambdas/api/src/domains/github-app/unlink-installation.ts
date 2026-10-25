import {deprovisionWebhooks} from '@/domains/github-app/webhook-provisioning';
import {getLogger} from '@gitgazer/backend-core/logger';
import {createEventLogEntry} from '@gitgazer/backend-services/event-log.controller';
import {db} from '@gitgazer/db/client';
import {githubAppInstallations, githubAppWebhooks} from '@gitgazer/db/schema/github/workflows';
import {and, eq} from 'drizzle-orm';

export const unlinkInstallation = async (integrationId: string, installationId: number): Promise<void> => {
    // Provisioning re-checks the link before recording a webhook (and deletes it otherwise), so a record either commits
    // before the detach and is read below, or never lands. Reading in this transaction leaves a later re-link's records alone.
    // Not withRlsTransaction: the writer's tenant policy rejects the detached row (integration_id NULL) as a write check.
    const recorded = await db.transaction(async (tx) => {
        await tx
            .update(githubAppInstallations)
            .set({integrationId: null, updatedAt: new Date()})
            .where(and(eq(githubAppInstallations.installationId, installationId), eq(githubAppInstallations.integrationId, integrationId)));

        return await tx
            .select({webhookId: githubAppWebhooks.webhookId, targetType: githubAppWebhooks.targetType, targetName: githubAppWebhooks.targetName})
            .from(githubAppWebhooks)
            .where(and(eq(githubAppWebhooks.integrationId, integrationId), eq(githubAppWebhooks.installationId, installationId)));
    });

    // The installation stays on GitHub, so its webhooks would keep firing unless removed here
    try {
        await deprovisionWebhooks(integrationId, installationId, recorded);
    } catch (error) {
        getLogger().error('Failed to deprovision webhooks', {error, integrationId, installationId});
    }

    try {
        await createEventLogEntry({
            integrationId,
            category: 'integration',
            type: 'info',
            title: 'GitHub App unlinked',
            message: `GitHub App installation ${installationId} was unlinked and webhooks deprovisioned`,
            metadata: {integrationId, installationId},
        });
    } catch (error) {
        getLogger().error('Failed to create event log entry for installation unlink', {error, integrationId, installationId});
    }
};
