import {resolveAndAssignOrgMembers} from '@/domains/members/org-member-resolver';
import {listOrgMembers} from '@/shared/clients/github-app.client';
import {getLogger} from '@/shared/logger';
import {db, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {users} from '@gitgazer/db/schema/gitgazer';
import {githubAppInstallations, githubOrgMembers, integrations, pendingOrgSync, userAssignments} from '@gitgazer/db/schema/github/workflows';
import {and, eq, inArray, isNotNull, notInArray, sql} from 'drizzle-orm';

const BATCH_SIZE = 500;

export const syncOrgMembers = async (installationId: number, accountLogin: string): Promise<void> => {
    const logger = getLogger();

    logger.info('Starting org member sync', {installationId, accountLogin});

    const members = await listOrgMembers(installationId, accountLogin);

    logger.info(`Fetched ${members.length} org members`, {installationId, accountLogin});

    // Batch upsert members
    for (let i = 0; i < members.length; i += BATCH_SIZE) {
        const batch = members.slice(i, i + BATCH_SIZE);

        await db
            .insert(githubOrgMembers)
            .values(
                batch.map((member) => ({
                    installationId,
                    githubUserId: member.id,
                    githubLogin: member.login,
                    role: member.role,
                    syncedAt: new Date(),
                })),
            )
            .onConflictDoUpdate({
                target: [githubOrgMembers.installationId, githubOrgMembers.githubUserId],
                set: {
                    githubLogin: sql`excluded.github_login`,
                    role: sql`excluded.role`,
                    syncedAt: sql`excluded.synced_at`,
                },
            });
    }

    // Remove members no longer in the org
    if (members.length > 0) {
        const memberIds = members.map((m) => m.id);
        await db
            .delete(githubOrgMembers)
            .where(and(eq(githubOrgMembers.installationId, installationId), notInArray(githubOrgMembers.githubUserId, memberIds)));
    } else {
        // An org with an installed GitHub App should have at least one admin member.
        // Empty response likely indicates a transient API error — skip cleanup to avoid data loss.
        logger.warn('GitHub API returned 0 org members, skipping stale member cleanup', {installationId, accountLogin});
    }

    logger.info('Org member sync completed', {installationId, accountLogin, memberCount: members.length});

    // Reconcile user-assignments for linked integrations
    try {
        await reconcileIntegrationMembers(installationId, accountLogin);
    } catch (error) {
        logger.error('Reconciliation failed, will retry on next scheduled sync', {
            installationId,
            accountLogin,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

/**
 * After syncing github_org_members, reconcile user-assignments for any linked integration:
 * 1. Auto-add new members (via resolveAndAssignOrgMembers — idempotent with onConflictDoNothing)
 * 2. Remove org_sync assignments for users no longer in the org
 */
const reconcileIntegrationMembers = async (installationId: number, accountLogin: string): Promise<void> => {
    const logger = getLogger();

    // Check if installation is linked to an integration
    const [linked] = await db
        .select({
            integrationId: integrations.integrationId,
            orgSyncDefaultRole: integrations.orgSyncDefaultRole,
        })
        .from(githubAppInstallations)
        .innerJoin(integrations, eq(githubAppInstallations.integrationId, integrations.integrationId))
        .where(eq(githubAppInstallations.installationId, installationId));

    if (!linked) {
        logger.debug('Installation not linked to integration, skipping reconciliation', {installationId});
        return;
    }

    const {integrationId} = linked;
    const role = linked.orgSyncDefaultRole ?? 'viewer';

    logger.info('Reconciling integration members after org sync', {installationId, integrationId});

    // 1. Auto-add any new members (idempotent — onConflictDoNothing)
    await resolveAndAssignOrgMembers({integrationId, installationId, role, accountLogin});

    // Fetch current org member IDs once — reused for both stale assignment cleanup and pending cleanup
    const currentOrgMemberIds = await db
        .select({githubUserId: githubOrgMembers.githubUserId})
        .from(githubOrgMembers)
        .where(eq(githubOrgMembers.installationId, installationId));

    const currentGithubIds = currentOrgMemberIds.map((m) => m.githubUserId);

    if (currentGithubIds.length === 0) {
        // Safety: don't mass-remove if org members table is empty (likely transient error)
        logger.debug('No org members found, skipping stale cleanup', {installationId, integrationId});
        return;
    }

    // 2. Remove org_sync assignments for users whose github_id is no longer in github_org_members
    await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx) => {
            const staleAssignments = await tx
                .select({userId: userAssignments.userId, githubId: users.githubId})
                .from(userAssignments)
                .innerJoin(users, eq(userAssignments.userId, users.id))
                .where(
                    and(
                        eq(userAssignments.integrationId, integrationId),
                        eq(userAssignments.source, 'org_sync'),
                        isNotNull(users.githubId),
                        notInArray(users.githubId, currentGithubIds),
                    ),
                );

            if (staleAssignments.length === 0) return;

            const staleUserIds = staleAssignments.map((a) => a.userId);

            await tx
                .delete(userAssignments)
                .where(
                    and(
                        eq(userAssignments.integrationId, integrationId),
                        inArray(userAssignments.userId, staleUserIds),
                        eq(userAssignments.source, 'org_sync'),
                    ),
                );

            logger.info('Removed stale org_sync assignments', {
                integrationId,
                installationId,
                removedCount: staleAssignments.length,
            });
        },
    });

    // 3. Clean up stale pending entries for members no longer in the org
    await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx) => {
            await tx
                .delete(pendingOrgSync)
                .where(and(eq(pendingOrgSync.integrationId, integrationId), notInArray(pendingOrgSync.githubUserId, currentGithubIds)));
        },
    });
};
