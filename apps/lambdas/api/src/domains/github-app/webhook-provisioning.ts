import {
    createOrgWebhook,
    createRepoWebhook,
    deleteOrgWebhook,
    deleteRepoWebhook,
    getInstallationOctokit,
    listInstallationRepos,
    RepoInfo,
    updateOrgWebhookEvents,
    updateOrgWebhookSecret,
    updateRepoWebhookEvents,
    updateRepoWebhookSecret,
} from '@gitgazer/backend-core/clients/github-app.client';
import config from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {githubAppInstallations, githubAppWebhooks} from '@gitgazer/db/schema/github/workflows';
import {and, eq, inArray} from 'drizzle-orm';
import {getGithubSettings} from '@/domains/apps/github-settings';

const getWebhookUrl = (integrationId: string): string => {
    const importUrlBase = config.get('importUrlBase');
    if (!importUrlBase) {
        throw new Error('IMPORT_URL_BASE is not configured');
    }
    return `${importUrlBase}/${integrationId}`;
};

type WebhookRecord = typeof githubAppWebhooks.$inferInsert;
type InstallationOctokit = ReturnType<typeof getInstallationOctokit>;

const deleteWebhookOnGithub = async (octokit: InstallationOctokit, webhook: Pick<WebhookRecord, 'targetType' | 'targetName' | 'webhookId'>) => {
    if (webhook.targetType === 'organization') {
        await deleteOrgWebhook(octokit, webhook.targetName, webhook.webhookId);
    } else {
        const [owner, repo] = webhook.targetName.split('/');
        await deleteRepoWebhook(octokit, owner, repo, webhook.webhookId);
    }
};

// Writer RLS, not db: the tenant policy hides an installation that is no longer linked to this integration, which is
// exactly the check. FOR SHARE makes a concurrent unlink's UPDATE wait for this record, or this read wait for its commit.
const recordWebhookIfLinked = async (webhook: WebhookRecord): Promise<boolean> =>
    await withRlsTransaction({
        integrationIds: [webhook.integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const settings = await getGithubSettings(tx, webhook.integrationId, 'share');
            const [installation] = await tx
                .select({installationId: githubAppInstallations.installationId})
                .from(githubAppInstallations)
                .where(
                    and(
                        eq(githubAppInstallations.installationId, webhook.installationId),
                        eq(githubAppInstallations.integrationId, webhook.integrationId),
                    ),
                )
                .for('share');
            if (!settings || !installation) return false;

            await tx.insert(githubAppWebhooks).values(webhook);
            return true;
        },
    });

// A live webhook without a record would never be deprovisioned
const deleteUnrecordedWebhook = async (octokit: InstallationOctokit, webhook: WebhookRecord, reason: 'unlinked' | 'record failed') => {
    const logger = getLogger();
    const context = {
        integrationId: webhook.integrationId,
        installationId: webhook.installationId,
        webhookId: webhook.webhookId,
        targetType: webhook.targetType,
        targetName: webhook.targetName,
        reason,
    };
    try {
        await deleteWebhookOnGithub(octokit, webhook);
        logger.warn('Deleted a new webhook that could not be recorded', context);
    } catch (error) {
        logger.error('Failed to delete a new webhook that could not be recorded', {...context, error});
    }
};

// GitHub calls hold no lock, so the installation can be unlinked (and already deprovisioned) while a webhook is being created
const keepWebhookIfLinked = async (octokit: InstallationOctokit, webhook: WebhookRecord): Promise<boolean> => {
    let recorded: boolean;
    try {
        recorded = await recordWebhookIfLinked(webhook);
    } catch (error) {
        await deleteUnrecordedWebhook(octokit, webhook, 'record failed');
        throw error;
    }
    if (!recorded) await deleteUnrecordedWebhook(octokit, webhook, 'unlinked');
    return recorded;
};

const loadGithubSettings = async (integrationId: string) => {
    const settings = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => await getGithubSettings(tx, integrationId),
    });

    if (!settings) {
        throw new Error(`Integration ${integrationId} has no GitHub app`);
    }
    return settings;
};

export const provisionWebhooks = async (integrationId: string, installationId: number): Promise<number> => {
    const logger = getLogger();
    logger.info(`Provisioning webhooks for integration ${integrationId}, installation ${installationId}`);

    const settings = await loadGithubSettings(integrationId);

    // Get installation config
    const [installation] = await db.select().from(githubAppInstallations).where(eq(githubAppInstallations.installationId, installationId));

    if (!installation) {
        throw new Error(`Installation ${installationId} not found`);
    }

    const webhookUrl = getWebhookUrl(integrationId);
    const events = installation.webhookEvents;
    const octokit = getInstallationOctokit(installationId);

    // An org installation with "all repositories" selected is covered by a single
    // org-level webhook that automatically captures every current AND future repo.
    // Decide this up front (independent of the current repo list) so the webhook is
    // still provisioned when the org currently has zero repositories.
    if (installation.repositorySelection === 'all' && installation.accountType === 'Organization') {
        try {
            const webhookId = await createOrgWebhook(octokit, installation.accountLogin, webhookUrl, settings.secret, events);
            const kept = await keepWebhookIfLinked(octokit, {
                integrationId,
                installationId,
                webhookId,
                targetType: 'organization',
                targetId: installation.accountId,
                targetName: installation.accountLogin,
                events,
            });
            // An unlinked installation must not fall through to the per-repo fallback below
            if (!kept) return 0;
            logger.info(`Created org-level webhook for ${installation.accountLogin} (ID: ${webhookId})`);
            return 1;
        } catch (error) {
            logger.error(`Failed to create org webhook for ${installation.accountLogin}, falling back to per-repo webhooks`, {error});
            // Fall through to per-repo provisioning below.
        }
    }

    // Per-repo webhooks: selected-repository installs, user accounts, or org webhook fallback.
    const repos = await listInstallationRepos(installationId);
    const webhookCount = await createPerRepoWebhooks(integrationId, installationId, octokit, repos, webhookUrl, settings.secret, events);

    logger.info(`Provisioned ${webhookCount} webhooks for integration ${integrationId}`);
    return webhookCount;
};

const createPerRepoWebhooks = async (
    integrationId: string,
    installationId: number,
    octokit: InstallationOctokit,
    repos: RepoInfo[],
    webhookUrl: string,
    secret: string,
    events: string[],
): Promise<number> => {
    const logger = getLogger();

    const results = await Promise.all(
        repos.map(async (repo) => {
            try {
                const webhookId = await createRepoWebhook(octokit, repo.owner, repo.name, webhookUrl, secret, events);
                const kept = await keepWebhookIfLinked(octokit, {
                    integrationId,
                    installationId,
                    webhookId,
                    targetType: 'repository',
                    targetId: repo.id,
                    targetName: repo.fullName,
                    events,
                });
                if (!kept) return 0;
                logger.info(`Created repo webhook for ${repo.fullName} (ID: ${webhookId})`);
                return 1 as number;
            } catch (error) {
                logger.error(`Failed to create webhook for ${repo.fullName}`, {error});
                return 0;
            }
        }),
    );

    return results.reduce((sum, r) => sum + r, 0);
};

export const provisionWebhooksForRepos = async (integrationId: string, installationId: number, repos: RepoInfo[]): Promise<number> => {
    const logger = getLogger();
    logger.info(`Provisioning webhooks for ${repos.length} new repos on integration ${integrationId}`);

    const settings = await loadGithubSettings(integrationId);

    const [installation] = await db.select().from(githubAppInstallations).where(eq(githubAppInstallations.installationId, installationId));

    if (!installation) {
        throw new Error(`Installation ${installationId} not found`);
    }

    // If this installation is already covered by an org-level webhook, newly added repos are
    // delivered through it automatically. Creating per-repo webhooks as well would double-deliver
    // every event for those repos, so skip per-repo provisioning.
    const [orgWebhook] = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) =>
            await tx
                .select()
                .from(githubAppWebhooks)
                .where(
                    and(
                        eq(githubAppWebhooks.integrationId, integrationId),
                        eq(githubAppWebhooks.installationId, installationId),
                        eq(githubAppWebhooks.targetType, 'organization'),
                    ),
                ),
    });

    if (orgWebhook) {
        logger.info(`Installation ${installationId} is covered by an org-level webhook; skipping per-repo provisioning for ${repos.length} repo(s)`);
        return 0;
    }

    const webhookUrl = getWebhookUrl(integrationId);
    const octokit = getInstallationOctokit(installationId);

    return await createPerRepoWebhooks(integrationId, installationId, octokit, repos, webhookUrl, settings.secret, installation.webhookEvents);
};

export type RecordedWebhook = Pick<typeof githubAppWebhooks.$inferSelect, 'webhookId' | 'targetType' | 'targetName'>;

export const deprovisionAllWebhooks = async (integrationId: string, installationId: number): Promise<void> => {
    const webhooks = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            return await tx.select().from(githubAppWebhooks).where(eq(githubAppWebhooks.installationId, installationId));
        },
    });

    await deprovisionWebhooks(integrationId, installationId, webhooks);
};

// Deletes only the given records, so webhooks recorded meanwhile (e.g. by a re-link) are left alone
export const deprovisionWebhooks = async (integrationId: string, installationId: number, webhooks: RecordedWebhook[]): Promise<void> => {
    const logger = getLogger();
    logger.info('Deprovisioning webhooks', {integrationId, installationId, count: webhooks.length});
    if (webhooks.length === 0) return;

    const octokit = getInstallationOctokit(installationId);

    await Promise.all(
        webhooks.map(async (webhook) => {
            logger.debug(`Deleting webhook ${webhook.webhookId} on ${webhook.targetName} (${webhook.targetType})`);
            try {
                await deleteWebhookOnGithub(octokit, webhook);
            } catch (error) {
                logger.warn(`Failed to delete webhook ${webhook.webhookId} on ${webhook.targetName} (may already be deleted)`, {error});
            }
        }),
    );

    // Clean up DB records for all webhooks (including failed ones, as they may already be gone)
    await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            await tx.delete(githubAppWebhooks).where(
                and(
                    eq(githubAppWebhooks.integrationId, integrationId),
                    eq(githubAppWebhooks.installationId, installationId),
                    inArray(
                        githubAppWebhooks.webhookId,
                        webhooks.map((w) => w.webhookId),
                    ),
                ),
            );
        },
    });

    logger.info('Deprovisioned webhooks', {integrationId, installationId, count: webhooks.length});
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

    const results = await Promise.allSettled(
        webhooks.map(async (webhook) => {
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
        }),
    );

    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length > 0) {
        results.forEach((r, idx) => {
            if (r.status === 'rejected') {
                const webhook = webhooks[idx];
                logger.error('Failed to update webhook events on a target', {
                    error: r.reason,
                    webhookId: webhook.webhookId,
                    targetName: webhook.targetName,
                });
            }
        });
        throw new Error(`Failed to update events on ${failures.length} of ${webhooks.length} webhook(s)`);
    }

    // Only reached when every per-webhook update succeeded.
    await db
        .update(githubAppInstallations)
        .set({webhookEvents: events, updatedAt: new Date()})
        .where(eq(githubAppInstallations.installationId, installationId));

    logger.info(`Updated webhook events for installation ${installationId}`);
};

export const updateAllWebhookSecrets = async (integrationId: string, installationId: number, secret: string): Promise<void> => {
    const logger = getLogger();
    logger.info(`Updating webhook secrets for integration ${integrationId}, installation ${installationId}`);

    const webhooks = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            return await tx
                .select()
                .from(githubAppWebhooks)
                .where(and(eq(githubAppWebhooks.integrationId, integrationId), eq(githubAppWebhooks.installationId, installationId)));
        },
    });

    const webhookUrl = getWebhookUrl(integrationId);
    const octokit = getInstallationOctokit(installationId);

    const results = await Promise.allSettled(
        webhooks.map(async (webhook) => {
            if (webhook.targetType === 'organization') {
                await updateOrgWebhookSecret(octokit, webhook.targetName, webhook.webhookId, webhookUrl, secret);
            } else {
                const [owner, repo] = webhook.targetName.split('/');
                await updateRepoWebhookSecret(octokit, owner, repo, webhook.webhookId, webhookUrl, secret);
            }
        }),
    );

    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length > 0) {
        results.forEach((r, idx) => {
            if (r.status === 'rejected') {
                const webhook = webhooks[idx];
                logger.error('Failed to update webhook secret on a target', {
                    error: r.reason,
                    webhookId: webhook.webhookId,
                    targetName: webhook.targetName,
                });
            }
        });
        throw new Error(`Failed to update secret on ${failures.length} of ${webhooks.length} webhook(s)`);
    }

    logger.info(`Updated webhook secrets for installation ${installationId}`);
};
