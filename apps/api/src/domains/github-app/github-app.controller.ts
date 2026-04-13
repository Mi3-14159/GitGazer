import {createEventLogEntry} from '@/domains/event-log/event-log.controller';
import {sendOrgMemberSyncTask} from '@/shared/clients/sqs.client';
import config from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {users} from '@gitgazer/db/schema/gitgazer';
import {
    githubAppInstallations,
    githubAppWebhooks,
    githubOrgMembers,
    integrations,
    pendingOrgSync,
    userAssignments,
} from '@gitgazer/db/schema/github/workflows';
import {type GithubOrgRole} from '@gitgazer/db/types';
import {
    InstallationEvent,
    InstallationRepositoriesEvent,
    InstallationTargetEvent,
    OrganizationEvent,
    OrganizationMemberAddedEvent,
    OrganizationMemberRemovedEvent,
} from '@octokit/webhooks-types';
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
        case 'organization':
            await handleOrganizationEvent(payload as OrganizationEvent);
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

            if (installation.account.type === 'Organization') {
                await dispatchOrgMemberSync(installation.id, installation.account.login);
            }

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

        case 'new_permissions_accepted': {
            logger.info(`New permissions accepted for installation ${installation.id}`);

            if (installation.account.type === 'Organization') {
                await dispatchOrgMemberSync(installation.id, installation.account.login);
            }

            break;
        }

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

const dispatchOrgMemberSync = async (installationId: number, accountLogin: string): Promise<void> => {
    const logger = getLogger();
    const queueUrl = config.get('webhookQueueUrl');

    logger.info('Dispatching org member sync to worker', {installationId, accountLogin});

    await sendOrgMemberSyncTask(queueUrl, {
        taskType: 'org_member_sync',
        installationId,
        accountLogin,
    });
};

const handleOrganizationEvent = async (event: OrganizationEvent): Promise<void> => {
    const logger = getLogger();
    const {action, installation} = event;

    if (!installation) {
        logger.warn('Organization event received without installation context');
        return;
    }

    switch (action) {
        case 'member_added': {
            const {membership} = event as OrganizationMemberAddedEvent;
            const member = membership.user;
            logger.info(`Member added to org: ${member.login} (ID: ${member.id})`, {installationId: installation.id});

            await db
                .insert(githubOrgMembers)
                .values({
                    installationId: installation.id,
                    githubUserId: member.id,
                    githubLogin: member.login,
                    role: membership.role as GithubOrgRole,
                    syncedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [githubOrgMembers.installationId, githubOrgMembers.githubUserId],
                    set: {
                        githubLogin: member.login,
                        role: membership.role as GithubOrgRole,
                        syncedAt: new Date(),
                    },
                });

            // Auto-add to integration if installation is linked
            await syncMemberToIntegration(installation.id, member.id, member.login);

            break;
        }

        case 'member_removed': {
            const {membership} = event as OrganizationMemberRemovedEvent;
            const member = membership.user;
            logger.info(`Member removed from org: ${member.login} (ID: ${member.id})`, {installationId: installation.id});

            await db
                .delete(githubOrgMembers)
                .where(and(eq(githubOrgMembers.installationId, installation.id), eq(githubOrgMembers.githubUserId, member.id)));

            // Auto-remove from integration if installation is linked (only org_sync sourced)
            await removeMemberFromIntegration(installation.id, member.id, member.login);

            break;
        }

        default:
            logger.debug(`Unhandled organization action: ${action}`, {installationId: installation.id});
    }
};

/**
 * When a member is added to a GitHub org, auto-add them to the linked integration
 * if the installation is linked and the user exists in GitGazer.
 */
const syncMemberToIntegration = async (installationId: number, githubUserId: number, githubLogin: string): Promise<void> => {
    const logger = getLogger();

    // Single join: installation → integration (avoids TOCTOU and reduces queries)
    const [linked] = await db
        .select({
            integrationId: integrations.integrationId,
            orgSyncDefaultRole: integrations.orgSyncDefaultRole,
        })
        .from(githubAppInstallations)
        .innerJoin(integrations, eq(githubAppInstallations.integrationId, integrations.integrationId))
        .where(eq(githubAppInstallations.installationId, installationId));

    if (!linked) {
        logger.debug('Installation not linked to integration, skipping member sync', {installationId});
        return;
    }

    const {integrationId} = linked;
    const role = linked.orgSyncDefaultRole ?? 'viewer';

    // Look up GitGazer user by github_id
    const [gitgazerUser] = await db.select({id: users.id}).from(users).where(eq(users.githubId, githubUserId));

    if (!gitgazerUser) {
        logger.info('Org member has no GitGazer account, storing as pending', {githubUserId, githubLogin, integrationId});

        await db
            .insert(pendingOrgSync)
            .values({
                integrationId,
                githubUserId,
                githubLogin,
                role,
            })
            .onConflictDoNothing({
                target: [pendingOrgSync.integrationId, pendingOrgSync.githubUserId],
            });

        return;
    }

    // Insert user-assignment with source='org_sync', skip if already exists
    let added = false;
    await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const result = await tx
                .insert(userAssignments)
                .values({
                    integrationId,
                    userId: gitgazerUser.id,
                    role,
                    source: 'org_sync',
                })
                .onConflictDoNothing({
                    target: [userAssignments.userId, userAssignments.integrationId],
                })
                .returning({userId: userAssignments.userId});

            added = result.length > 0;
        },
    });

    if (added) {
        logger.info('Auto-added org member to integration', {githubUserId, githubLogin, integrationId, role});

        await createEventLogEntry({
            integrationId,
            category: 'integration',
            type: 'info',
            title: 'Org member auto-added',
            message: `GitHub org member "${githubLogin}" was automatically added with role "${role}"`,
            metadata: {installationId, githubUserId, githubLogin, role},
        }).catch((err) => {
            logger.error('Failed to write event log for member auto-add', {error: err});
        });
    } else {
        logger.debug('Org member already has integration assignment, skipping', {githubUserId, githubLogin, integrationId});
    }
};

/**
 * When a member is removed from a GitHub org, remove them from the linked integration
 * only if they were auto-synced (source = 'org_sync'). Never remove owners or manually-invited members.
 */
const removeMemberFromIntegration = async (installationId: number, githubUserId: number, githubLogin: string): Promise<void> => {
    const logger = getLogger();

    // Single join: installation → integration (consistent with syncMemberToIntegration)
    const [linked] = await db
        .select({
            integrationId: integrations.integrationId,
        })
        .from(githubAppInstallations)
        .innerJoin(integrations, eq(githubAppInstallations.integrationId, integrations.integrationId))
        .where(eq(githubAppInstallations.installationId, installationId));

    if (!linked) {
        logger.debug('Installation not linked to integration, skipping member removal', {installationId});
        return;
    }

    const {integrationId} = linked;

    // Look up GitGazer user by github_id
    const [gitgazerUser] = await db.select({id: users.id}).from(users).where(eq(users.githubId, githubUserId));

    if (!gitgazerUser) {
        logger.debug('Org member has no GitGazer account, cleaning up pending entry', {githubUserId, githubLogin, integrationId});

        // Clean up any pending org sync entry for this member
        await db.delete(pendingOrgSync).where(and(eq(pendingOrgSync.integrationId, integrationId), eq(pendingOrgSync.githubUserId, githubUserId)));

        return;
    }

    // Only remove if source is 'org_sync' — never remove manually-invited or owner members
    let removed = false;
    await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const result = await tx
                .delete(userAssignments)
                .where(
                    and(
                        eq(userAssignments.integrationId, integrationId),
                        eq(userAssignments.userId, gitgazerUser.id),
                        eq(userAssignments.source, 'org_sync'),
                    ),
                )
                .returning({userId: userAssignments.userId});

            removed = result.length > 0;
        },
    });

    if (removed) {
        logger.info('Removed org-synced member from integration', {githubUserId, githubLogin, integrationId});

        await createEventLogEntry({
            integrationId,
            category: 'integration',
            type: 'warning',
            title: 'Org member auto-removed',
            message: `GitHub org member "${githubLogin}" was automatically removed (left the organization)`,
            metadata: {installationId, githubUserId, githubLogin},
        }).catch((err) => {
            logger.error('Failed to write event log for member auto-removal', {error: err});
        });
    } else {
        logger.debug('No org_sync assignment found for member, skipping removal', {githubUserId, githubLogin, integrationId});
    }
};
