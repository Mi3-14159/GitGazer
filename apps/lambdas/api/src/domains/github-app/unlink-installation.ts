import {deprovisionAllWebhooks} from '@/domains/github-app/webhook-provisioning';
import {getLogger} from '@gitgazer/backend-core/logger';
import {createEventLogEntry} from '@gitgazer/backend-services/event-log.controller';
import {db} from '@gitgazer/db/client';
import {githubAppInstallations} from '@gitgazer/db/schema/github/workflows';
import {and, eq} from 'drizzle-orm';

export const unlinkInstallation = async (integrationId: string, installationId: number): Promise<void> => {
    // Detach before deprovisioning: provisioning re-checks the link before recording a webhook (and deletes it otherwise),
    // so every recorded webhook committed before this detach and is found below.
    await db
        .update(githubAppInstallations)
        .set({integrationId: null, updatedAt: new Date()})
        .where(and(eq(githubAppInstallations.installationId, installationId), eq(githubAppInstallations.integrationId, integrationId)));

    // The installation stays on GitHub, so its webhooks would keep firing unless removed here
    try {
        await deprovisionAllWebhooks(integrationId, installationId);
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
