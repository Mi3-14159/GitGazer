import {createEventLogEntry} from '@/domains/event-log/event-log.controller';
import {getLogger} from '@/shared/logger';
import {db, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {users} from '@gitgazer/db/schema/gitgazer';
import {githubOrgMembers, pendingOrgSync, userAssignments} from '@gitgazer/db/schema/github/workflows';
import {type OrgSyncDefaultRole} from '@gitgazer/db/types';
import {eq, inArray} from 'drizzle-orm';

type ResolveResult = {
    matched: number;
    unmatched: number;
};

/**
 * Resolves GitHub org members for an installation to GitGazer users and
 * auto-inserts user-assignments for the given integration.
 *
 * - Reads `github_org_members` for the installation.
 * - Matches each member to a `gitgazer.users` row by `github_id`.
 * - For matched users: inserts `user-assignments` with the configured role,
 *   using `onConflictDoNothing` to avoid overwriting existing roles.
 * - Logs results in the event log.
 */
export const resolveAndAssignOrgMembers = async (params: {
    integrationId: string;
    installationId: number;
    role: OrgSyncDefaultRole;
    accountLogin: string;
}): Promise<ResolveResult> => {
    const logger = getLogger();
    const {integrationId, installationId, role, accountLogin} = params;

    // 1. Fetch all org members for this installation
    const orgMembers = await db.select().from(githubOrgMembers).where(eq(githubOrgMembers.installationId, installationId));

    if (orgMembers.length === 0) {
        logger.info('No org members found for installation, skipping auto-add', {installationId, integrationId});
        return {matched: 0, unmatched: 0};
    }

    // 2. Resolve org members → GitGazer users by github_id (batched to avoid oversized IN clauses)
    const githubUserIds = orgMembers.map((m) => m.githubUserId);
    const QUERY_BATCH_SIZE = 500;
    const matchedUsers: Array<{id: number; githubId: number | null}> = [];

    for (let i = 0; i < githubUserIds.length; i += QUERY_BATCH_SIZE) {
        const batch = githubUserIds.slice(i, i + QUERY_BATCH_SIZE);
        const results = await db.select({id: users.id, githubId: users.githubId}).from(users).where(inArray(users.githubId, batch));
        matchedUsers.push(...results);
    }

    const githubIdToUserId = new Map(matchedUsers.filter((u) => u.githubId !== null).map((u) => [u.githubId!, u.id]));

    const matched: Array<{userId: number; githubUserId: number}> = [];
    const unmatched: Array<{githubUserId: number; githubLogin: string}> = [];

    for (const member of orgMembers) {
        const userId = githubIdToUserId.get(member.githubUserId);
        if (userId !== undefined) {
            matched.push({userId, githubUserId: member.githubUserId});
        } else {
            unmatched.push({githubUserId: member.githubUserId, githubLogin: member.githubLogin});
        }
    }

    // 3. Batch insert user-assignments for matched users (skip existing)
    if (matched.length > 0) {
        const BATCH_SIZE = 500;
        await withRlsTransaction({
            integrationIds: [integrationId],
            userName: gitgazerWriter.name,
            callback: async (tx) => {
                for (let i = 0; i < matched.length; i += BATCH_SIZE) {
                    const batch = matched.slice(i, i + BATCH_SIZE);
                    await tx
                        .insert(userAssignments)
                        .values(
                            batch.map((m) => ({
                                integrationId,
                                userId: m.userId,
                                role,
                                source: 'org_sync' as const,
                            })),
                        )
                        .onConflictDoNothing({
                            target: [userAssignments.userId, userAssignments.integrationId],
                        });
                }
            },
        });
    }

    // 4. Store pending entries for unmatched members (deferred matching on login)
    //    These are resolved in authentication.ts when the user first logs in.
    if (unmatched.length > 0) {
        const BATCH_SIZE = 500;
        await withRlsTransaction({
            integrationIds: [integrationId],
            userName: gitgazerWriter.name,
            callback: async (tx) => {
                for (let i = 0; i < unmatched.length; i += BATCH_SIZE) {
                    const batch = unmatched.slice(i, i + BATCH_SIZE);
                    await tx
                        .insert(pendingOrgSync)
                        .values(
                            batch.map((m) => ({
                                integrationId,
                                githubUserId: m.githubUserId,
                                githubLogin: m.githubLogin,
                                role,
                            })),
                        )
                        .onConflictDoNothing({
                            target: [pendingOrgSync.integrationId, pendingOrgSync.githubUserId],
                        });
                }
            },
        });

        logger.info('Stored pending org sync entries for unmatched members', {
            integrationId,
            installationId,
            pendingCount: unmatched.length,
        });
    }

    logger.info('Org member auto-add completed', {
        integrationId,
        installationId,
        matched: matched.length,
        unmatched: unmatched.length,
    });

    // 5. Log results in event log
    await createEventLogEntry({
        integrationId,
        category: 'integration',
        type: matched.length > 0 ? 'success' : 'info',
        title: 'Org members auto-synced',
        message: `Auto-added ${matched.length} org member(s) from "${accountLogin}" with role "${role}". ${unmatched.length} member(s) could not be matched to GitGazer accounts.`,
        metadata: {installationId, accountLogin, matched: matched.length, unmatched: unmatched.length, role},
    }).catch((err) => {
        logger.error('Failed to write event log for org member auto-sync', {error: err});
    });

    return {matched: matched.length, unmatched: unmatched.length};
};
