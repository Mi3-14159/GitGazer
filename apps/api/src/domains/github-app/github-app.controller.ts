import {getLogger} from '@/shared/logger';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {githubAppInstallations, githubAppWebhooks} from '@gitgazer/db/schema/github/workflows';
import {InstallationEvent, InstallationRepositoriesEvent, InstallationTargetEvent} from '@octokit/webhooks-types';
import {and, eq} from 'drizzle-orm';
import {provisionWebhooksForRepos} from './webhook-provisioning';

export const handleGithubAppEvent = async (eventType: string, payload: unknown): Promise<void> => {
    const logger = getLogger();

    switch (eventType) {
        case 'installation':
            await handleInstallationEvent(payload as InstallationEvent);
            break;
        case 'installation_repositories':
            await handleInstallationRepositoriesEvent(payload as InstallationRepositoriesEvent);
            break;
        case 'installation_target':
            await handleInstallationTargetEvent(payload as InstallationTargetEvent);
            break;
        default:
            logger.warn(`Unhandled GitHub App event type: ${eventType}`);
    }
};

const handleInstallationEvent = async (event: InstallationEvent): Promise<void> => {
    const logger = getLogger();
    const {action, installation, sender} = event;

    switch (action) {
        case 'created': {
            logger.info(`GitHub App installed on ${installation.account.login} (ID: ${installation.id})`);

            await db
                .insert(githubAppInstallations)
                .values({
                    installationId: installation.id,
                    integrationId: null,
                    accountType: installation.account.type,
                    accountLogin: installation.account.login,
                    accountId: installation.account.id,
                    repositorySelection: installation.repository_selection,
                    senderId: sender.id,
                })
                .onConflictDoNothing();

            break;
        }

        case 'deleted': {
            logger.info(`GitHub App uninstalled from ${installation.account.login} (ID: ${installation.id})`);

            const [existing] = await db.select().from(githubAppInstallations).where(eq(githubAppInstallations.installationId, installation.id));

            if (existing?.integrationId) {
                // The installation token is already revoked by the time we receive the 'deleted' event,
                // so we cannot call the GitHub API to delete webhooks. Just clean up DB records.
                // The webhooks on GitHub's side are automatically removed when the app is uninstalled.
                await withRlsTransaction({
                    integrationIds: [existing.integrationId],
                    userName: gitgazerWriter.name,
                    callback: async (tx: RdsTransaction) => {
                        await tx.delete(githubAppWebhooks).where(eq(githubAppWebhooks.installationId, installation.id));
                    },
                });
            }

            await db.delete(githubAppInstallations).where(eq(githubAppInstallations.installationId, installation.id));

            break;
        }

        case 'new_permissions_accepted':
            logger.info(`New permissions accepted for installation ${installation.id}`);
            break;

        default:
            logger.warn(`Unhandled installation action: ${action}`);
    }
};

const handleInstallationRepositoriesEvent = async (event: InstallationRepositoriesEvent): Promise<void> => {
    const logger = getLogger();
    const {action, installation, repositories_added, repositories_removed} = event;

    const [existing] = await db.select().from(githubAppInstallations).where(eq(githubAppInstallations.installationId, installation.id));

    if (!existing) {
        logger.warn(`Installation ${installation.id} not found in DB`);
        return;
    }

    // Update repository_selection
    await db
        .update(githubAppInstallations)
        .set({
            repositorySelection: installation.repository_selection,
            updatedAt: new Date(),
        })
        .where(eq(githubAppInstallations.installationId, installation.id));

    // Only provision/deprovision if linked to an integration
    if (!existing.integrationId) {
        logger.info(`Installation ${installation.id} not linked to integration, skipping webhook sync`);
        return;
    }

    if (action === 'added' && repositories_added.length > 0) {
        logger.info(`${repositories_added.length} repos added to installation ${installation.id}`);
        await provisionWebhooksForRepos(
            existing.integrationId,
            installation.id,
            repositories_added.map((r) => ({
                id: r.id,
                name: r.name,
                fullName: r.full_name,
                owner: r.full_name.split('/')[0],
                private: r.private,
            })),
        );
    }

    if (action === 'removed' && repositories_removed.length > 0) {
        logger.info(`${repositories_removed.length} repos removed from installation ${installation.id}`);
        // GitHub auto-deletes webhooks when repos are removed from the app, just clean up DB records
        for (const repo of repositories_removed) {
            await db
                .delete(githubAppWebhooks)
                .where(
                    and(
                        eq(githubAppWebhooks.integrationId, existing.integrationId),
                        eq(githubAppWebhooks.targetType, 'repository'),
                        eq(githubAppWebhooks.targetId, repo.id),
                    ),
                );
        }
    }
};

const handleInstallationTargetEvent = async (event: InstallationTargetEvent): Promise<void> => {
    const logger = getLogger();

    if (event.changes?.login?.from) {
        logger.info(`Installation target renamed from ${event.changes.login.from} to ${event.account.login}`);
        await db
            .update(githubAppInstallations)
            .set({
                accountLogin: event.account.login,
                updatedAt: new Date(),
            })
            .where(eq(githubAppInstallations.installationId, event.installation.id));
    }
};
