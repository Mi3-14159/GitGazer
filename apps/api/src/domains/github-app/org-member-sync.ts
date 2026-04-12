import {listOrgMembers} from '@/shared/clients/github-app.client';
import {getLogger} from '@/shared/logger';
import {db} from '@gitgazer/db/client';
import {githubOrgMembers} from '@gitgazer/db/schema/github/workflows';
import {and, eq, notInArray, sql} from 'drizzle-orm';

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
};
