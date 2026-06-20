/**
 * Reuses repository + organization sub-dependencies already stored in Postgres
 * so the backfill worker can skip the GitHub `GET /repos/{owner}/{repo}` call.
 *
 * Importing any entity (workflow run, job, pull request, review) first requires
 * its repository — and, for org-owned repos, its organization — to exist. Those
 * are normally supplied by `fetchRepo`, whose response also embeds the
 * organization. When a previous backfill or a live webhook has already imported
 * the repository, the same data is in the database, so we rebuild the minimal
 * repo payload the importers read from stored rows instead of calling GitHub.
 *
 * Reads run inside an RLS-scoped transaction under the default reader role, so
 * each lookup only sees rows belonging to the task's integration.
 */

import {getLogger} from '@/shared/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {organizations, repositories, user} from '@gitgazer/db/schema';
import {and, eq} from 'drizzle-orm';

import {fetchRepo} from './github';

const logger = getLogger();

/**
 * The subset of the GitHub repository payload that the importers actually read
 * (see `importWorkflow` / `importPullRequest`). Field names mirror the GitHub
 * REST shape so a rebuilt value drops straight into the backfill transforms.
 */
export type StoredRepo = {
    id: number;
    name: string;
    private: boolean;
    created_at: string;
    updated_at: string;
    default_branch: string;
    topics: string[];
    owner: {id: number; login: string; type: string};
    organization?: {id: number; login: string; description: string | null};
};

/**
 * Returns the repository (with its organization, if any) from Postgres when it
 * already exists for the integration, or `null` when it must be fetched from
 * GitHub. The owner is matched by login so repositories that share a short name
 * across different owners under one integration cannot collide.
 */
export const getStoredRepository = async (integrationId: string, owner: string, repo: string): Promise<StoredRepo | null> => {
    const rows = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) =>
            tx
                .select({
                    id: repositories.id,
                    name: repositories.name,
                    private: repositories.private,
                    createdAt: repositories.createdAt,
                    updatedAt: repositories.updatedAt,
                    defaultBranch: repositories.defaultBranch,
                    topics: repositories.topics,
                    ownerId: user.id,
                    ownerLogin: user.login,
                    ownerType: user.type,
                    orgId: organizations.id,
                    orgLogin: organizations.login,
                    orgDescription: organizations.description,
                })
                .from(repositories)
                .innerJoin(user, and(eq(user.integrationId, repositories.integrationId), eq(user.id, repositories.ownerId)))
                .leftJoin(
                    organizations,
                    and(eq(organizations.integrationId, repositories.integrationId), eq(organizations.id, repositories.organizationId)),
                )
                .where(and(eq(repositories.integrationId, integrationId), eq(repositories.name, repo), eq(user.login, owner)))
                .limit(1),
    });

    const row = rows[0];
    if (!row) return null;

    return {
        id: row.id,
        name: row.name,
        private: row.private,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
        default_branch: row.defaultBranch,
        topics: row.topics,
        owner: {id: row.ownerId, login: row.ownerLogin, type: row.ownerType},
        organization: row.orgId !== null && row.orgLogin !== null ? {id: row.orgId, login: row.orgLogin, description: row.orgDescription} : undefined,
    };
};

/** Resolved repository payloads, cached per `integrationId/owner/repo` for the container lifetime. */
const resolvedRepoCache = new Map<string, unknown>();

/**
 * Resolves the repository payload for a backfill task, preferring the copy
 * already in Postgres and falling back to a GitHub fetch only when it is absent.
 * The result is cached per container so repeated tasks for the same repository
 * neither re-read the database nor re-call GitHub.
 */
export const resolveRepo = async (integrationId: string, owner: string, repo: string, token: string): Promise<unknown> => {
    const key = `${integrationId}/${owner}/${repo}`;
    // `has` rather than a truthy check so a resolved value is cached exactly once,
    // independent of whether the payload happens to be falsy.
    if (resolvedRepoCache.has(key)) {
        return resolvedRepoCache.get(key);
    }

    const stored = await getStoredRepository(integrationId, owner, repo);
    if (stored) {
        logger.debug('Reusing stored repository sub-dependency; skipping GitHub fetch', {integrationId, owner, repo});
    }

    const resolved = stored ?? (await fetchRepo(owner, repo, token));
    resolvedRepoCache.set(key, resolved);
    return resolved;
};
