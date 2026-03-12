import {
    createOrgWebhook,
    createRepoWebhook,
    deleteOrgWebhook,
    deleteRepoWebhook,
    getInstallationOctokit,
    listInstallationRepos,
    RepoInfo,
    updateOrgWebhookEvents,
    updateRepoWebhookEvents,
} from '@/clients/githubApp';
import {getLogger} from '@/logger';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {githubAppInstallations, githubAppWebhooks, integrations} from '@gitgazer/db/schema/github/workflows';
import {and, eq} from 'drizzle-orm';

const importUrlBase = process.env.IMPORT_URL_BASE;

const getWebhookUrl = (integrationId: string): string => {
    if (!importUrlBase) {
        throw new Error('IMPORT_URL_BASE environment variable is not set');
    }
    return `${importUrlBase}/${integrationId}`;
};

export const provisionWebhooks = async (integrationId: string, installationId: number): Promise<number> => {
    const logger = getLogger();
    logger.info(`Provisioning webhooks for integration ${integrationId}, installation ${installationId}`);

    // Get integration secret
    const [integration] = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            return await tx.select().from(integrations).where(eq(integrations.integrationId, integrationId));
        },
    });

    if (!integration) {
        throw new Error(`Integration ${integrationId} not found`);
    }

    // Get installation config
    const [installation] = await db.select().from(githubAppInstallations).where(eq(githubAppInstallations.installationId, installationId));

    if (!installation) {
        throw new Error(`Installation ${installationId} not found`);
    }

    const repos = await listInstallationRepos(installationId);
    const webhookUrl = getWebhookUrl(integrationId);
    const events = installation.webhookEvents;
    const octokit = getInstallationOctokit(installationId);

    // Group repos by org owner
    const reposByOrg = new Map<string, RepoInfo[]>();

    for (const repo of repos) {
        // Check if repo belongs to an org (we look at the owner)
        const ownerRepos = reposByOrg.get(repo.owner) ?? [];
        ownerRepos.push(repo);
        reposByOrg.set(repo.owner, ownerRepos);
    }

    let webhookCount = 0;

    for (const [owner, orgRepos] of reposByOrg) {
        // If "all" repos selected and this is an org account, use org-level webhook
        if (installation.repositorySelection === 'all' && installation.accountType === 'Organization' && owner === installation.accountLogin) {
            try {
                const webhookId = await createOrgWebhook(octokit, owner, webhookUrl, integration.secret, events);
                await db.insert(githubAppWebhooks).values({
                    integrationId,
                    installationId,
                    webhookId,
                    targetType: 'organization',
                    targetId: installation.accountId,
                    targetName: owner,
                    events,
                });
                webhookCount++;
                logger.info(`Created org-level webhook for ${owner} (ID: ${webhookId})`);
            } catch (error) {
                logger.error(`Failed to create org webhook for ${owner}`, {error});
                // Fall back to per-repo webhooks
                webhookCount += await createPerRepoWebhooks(integrationId, installationId, octokit, orgRepos, webhookUrl, integration.secret, events);
            }
        } else {
            // Per-repo webhooks
            webhookCount += await createPerRepoWebhooks(integrationId, installationId, octokit, orgRepos, webhookUrl, integration.secret, events);
        }
    }

    logger.info(`Provisioned ${webhookCount} webhooks for integration ${integrationId}`);
    return webhookCount;
};

const createPerRepoWebhooks = async (
    integrationId: string,
    installationId: number,
    octokit: ReturnType<typeof getInstallationOctokit>,
    repos: RepoInfo[],
    webhookUrl: string,
    secret: string,
    events: string[],
): Promise<number> => {
    const logger = getLogger();
    let count = 0;

    for (const repo of repos) {
        try {
            const webhookId = await createRepoWebhook(octokit, repo.owner, repo.name, webhookUrl, secret, events);
            await db.insert(githubAppWebhooks).values({
                integrationId,
                installationId,
                webhookId,
                targetType: 'repository',
                targetId: repo.id,
                targetName: repo.fullName,
                events,
            });
            count++;
            logger.info(`Created repo webhook for ${repo.fullName} (ID: ${webhookId})`);
        } catch (error) {
            logger.error(`Failed to create webhook for ${repo.fullName}`, {error});
        }
    }

    return count;
};

export const provisionWebhooksForRepos = async (integrationId: string, installationId: number, repos: RepoInfo[]): Promise<number> => {
    const logger = getLogger();
    logger.info(`Provisioning webhooks for ${repos.length} new repos on integration ${integrationId}`);

    const [integration] = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            return await tx.select().from(integrations).where(eq(integrations.integrationId, integrationId));
        },
    });

    if (!integration) {
        throw new Error(`Integration ${integrationId} not found`);
    }

    const [installation] = await db.select().from(githubAppInstallations).where(eq(githubAppInstallations.installationId, installationId));

    if (!installation) {
        throw new Error(`Installation ${installationId} not found`);
    }

    const webhookUrl = getWebhookUrl(integrationId);
    const octokit = getInstallationOctokit(installationId);

    return await createPerRepoWebhooks(integrationId, installationId, octokit, repos, webhookUrl, integration.secret, installation.webhookEvents);
};

export const deprovisionAllWebhooks = async (integrationId: string, installationId: number): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deprovisioning all webhooks for integration ${integrationId}, installation ${installationId}`);

    const webhooks = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            return await tx.select().from(githubAppWebhooks).where(eq(githubAppWebhooks.installationId, installationId));
        },
    });

    logger.debug(`Found ${webhooks.length} webhooks to delete for installation ${installationId}`);
    const octokit = getInstallationOctokit(installationId);

    for (const webhook of webhooks) {
        logger.debug(`Deleting webhook ${webhook.webhookId} on ${webhook.targetName} (${webhook.targetType})`);
        try {
            if (webhook.targetType === 'organization') {
                await deleteOrgWebhook(octokit, webhook.targetName, webhook.webhookId);
            } else {
                const [owner, repo] = webhook.targetName.split('/');
                await deleteRepoWebhook(octokit, owner, repo, webhook.webhookId);
            }
        } catch (error) {
            logger.warn(`Failed to delete webhook ${webhook.webhookId} on ${webhook.targetName} (may already be deleted)`, {error});
        }
    }

    // Clean up DB records for all webhooks (including failed ones, as they may already be gone)
    await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            await tx.delete(githubAppWebhooks).where(eq(githubAppWebhooks.installationId, installationId));
        },
    });

    logger.info(`Deprovisioned all webhooks for installation ${installationId}`);
};

export const updateAllWebhookEvents = async (integrationId: string, installationId: number, events: string[]): Promise<void> => {
    const logger = getLogger();
    logger.info(`Updating webhook events for installation ${installationId} to: ${events.join(', ')}`);

    const webhooks = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            return await tx
                .select()
                .from(githubAppWebhooks)
                .where(and(eq(githubAppWebhooks.integrationId, integrationId), eq(githubAppWebhooks.installationId, installationId)));
        },
    });

    const octokit = getInstallationOctokit(installationId);

    for (const webhook of webhooks) {
        try {
            if (webhook.targetType === 'organization') {
                await updateOrgWebhookEvents(octokit, webhook.targetName, webhook.webhookId, events);
            } else {
                const [owner, repo] = webhook.targetName.split('/');
                await updateRepoWebhookEvents(octokit, owner, repo, webhook.webhookId, events);
            }

            // Update events in DB record
            await withRlsTransaction({
                integrationIds: [integrationId],
                userName: gitgazerWriter.name,
                callback: async (tx: RdsTransaction) => {
                    await tx
                        .update(githubAppWebhooks)
                        .set({events})
                        .where(and(eq(githubAppWebhooks.integrationId, integrationId), eq(githubAppWebhooks.webhookId, webhook.webhookId)));
                },
            });
        } catch (error) {
            logger.error(`Failed to update events on webhook ${webhook.webhookId} (${webhook.targetName})`, {error});
        }
    }

    // Update the installation's configured events
    await db
        .update(githubAppInstallations)
        .set({webhookEvents: events, updatedAt: new Date()})
        .where(eq(githubAppInstallations.installationId, installationId));

    logger.info(`Updated webhook events for installation ${installationId}`);
};
