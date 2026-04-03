import {RdsTransaction} from '@gitgazer/db/client';
import {
    enterprises,
    organizations,
    pullRequestReviews,
    pullRequests,
    repositories,
    user,
    workflowJobs,
    workflowRunPullRequests,
    workflowRuns,
} from '@gitgazer/db/schema/github/workflows';
import {
    EnterpriseInsert,
    EnterpriseSelect,
    OrganizationInsert,
    OrganizationSelect,
    PullRequest,
    PullRequestInsert,
    PullRequestReview,
    PullRequestReviewInsert,
    RepositoryInsert,
    RepositorySelect,
    UserInsert,
    UserSelect,
    WorkflowJob,
    WorkflowJobInsert,
    WorkflowRun,
    WorkflowRunInsert,
    WorkflowRunPullRequestInsert,
    WorkflowRunPullRequestSelect,
} from '@gitgazer/db/types';
import {and, inArray, sql} from 'drizzle-orm';

export const upsertEnterprises = async (tx: RdsTransaction, payload: EnterpriseInsert[]): Promise<{enterprises: EnterpriseSelect[]}> => {
    if (payload.length === 0) {
        return {enterprises: []};
    }

    payload = payload.filter(
        (enterprise, index, self) => index === self.findIndex((e) => e.integrationId === enterprise.integrationId && e.id === enterprise.id),
    );

    const enterpriseInserted = await tx
        .insert(enterprises)
        .values(payload)
        .onConflictDoUpdate({
            target: [enterprises.integrationId, enterprises.id],
            set: {
                name: sql`EXCLUDED.name`,
            },
            setWhere: sql`${enterprises.name} IS DISTINCT FROM EXCLUDED.name`,
        })
        .returning();

    if (enterpriseInserted.length === payload.length) {
        return {enterprises: enterpriseInserted};
    }

    const enterpriseIds = payload.map((e) => e.id);
    const enterprisesFound = await tx.select().from(enterprises).where(inArray(enterprises.id, enterpriseIds));

    if (!enterprisesFound || enterprisesFound.length === 0) {
        throw new Error(`Failed to insert or find enterprises with id ${enterpriseIds.join(', ')}`);
    }

    if (enterprisesFound.length !== payload.length) {
        throw new Error(`Mismatch in number of enterprises inserted vs found. Expected: ${payload.length}, Found: ${enterprisesFound.length}`);
    }

    return {enterprises: enterprisesFound};
};

export const upsertOrganizations = async (tx: RdsTransaction, payload: OrganizationInsert[]): Promise<{organizations: OrganizationSelect[]}> => {
    if (payload.length === 0) {
        return {organizations: []};
    }

    payload = payload.filter(
        (organization, index, self) => index === self.findIndex((o) => o.integrationId === organization.integrationId && o.id === organization.id),
    );

    const organizationsInserted = await tx
        .insert(organizations)
        .values(payload)
        .onConflictDoUpdate({
            target: [organizations.integrationId, organizations.id],
            set: {
                login: sql`EXCLUDED.login`,
                description: sql`EXCLUDED.description`,
                enterpriseId: sql`EXCLUDED.enterprise_id`,
            },
            setWhere: sql`${organizations.login} IS DISTINCT FROM EXCLUDED.login OR ${organizations.description} IS DISTINCT FROM EXCLUDED.description OR ${organizations.enterpriseId} IS DISTINCT FROM EXCLUDED.enterprise_id`,
        })
        .returning();

    if (organizationsInserted.length === payload.length) {
        return {organizations: organizationsInserted};
    }

    const organizationIds = payload.map((o) => o.id);
    const organizationsFound = await tx.select().from(organizations).where(inArray(organizations.id, organizationIds));

    if (!organizationsFound || organizationsFound.length === 0) {
        throw new Error(`Failed to insert or find organizations with id ${organizationIds.join(', ')}`);
    }

    if (organizationsFound.length !== payload.length) {
        throw new Error(`Mismatch in number of organizations inserted vs found. Expected: ${payload.length}, Found: ${organizationsFound.length}`);
    }

    return {organizations: organizationsFound};
};

export const upsertRepositories = async (tx: RdsTransaction, payload: RepositoryInsert[]): Promise<{repositories: RepositorySelect[]}> => {
    if (payload.length === 0) {
        return {repositories: []};
    }

    payload = payload.filter((repo, index, self) => index === self.findIndex((r) => r.integrationId === repo.integrationId && r.id === repo.id));

    let repositoriesInserted = await tx
        .insert(repositories)
        .values(payload)
        .onConflictDoUpdate({
            target: [repositories.integrationId, repositories.id],
            set: {
                name: sql`EXCLUDED.name`,
                private: sql`EXCLUDED.private`,
                updatedAt: sql`EXCLUDED.updated_at`,
                defaultBranch: sql`EXCLUDED.default_branch`,
                topics: sql`EXCLUDED.topics`,
                ownerId: sql`EXCLUDED.owner_id`,
                organizationId: sql`EXCLUDED.organization_id`,
            },
            setWhere: sql`${repositories.name} IS DISTINCT FROM EXCLUDED.name OR
                      ${repositories.private} IS DISTINCT FROM EXCLUDED.private OR
                      ${repositories.updatedAt} IS DISTINCT FROM EXCLUDED.updated_at OR
                      ${repositories.defaultBranch} IS DISTINCT FROM EXCLUDED.default_branch OR
                      ${repositories.topics} IS DISTINCT FROM EXCLUDED.topics OR
                      ${repositories.ownerId} IS DISTINCT FROM EXCLUDED.owner_id OR
                      ${repositories.organizationId} IS DISTINCT FROM EXCLUDED.organization_id`,
        })
        .returning();

    if (repositoriesInserted.length === payload.length) {
        return {repositories: repositoriesInserted};
    }

    repositoriesInserted = await tx
        .select()
        .from(repositories)
        .where(
            inArray(
                repositories.id,
                payload.map((r) => r.id),
            ),
        );

    if (!repositoriesInserted || repositoriesInserted.length === 0) {
        throw new Error(`Failed to insert or find repositories with id ${payload.map((r) => r.id).join(', ')}`);
    }

    if (repositoriesInserted.length !== payload.length) {
        throw new Error(`Mismatch in number of repositories inserted vs found. Expected: ${payload.length}, Found: ${repositoriesInserted.length}`);
    }

    return {repositories: repositoriesInserted};
};

export const upsertUsers = async (tx: RdsTransaction, payload: UserInsert[]): Promise<{users: UserSelect[]}> => {
    if (payload.length === 0) {
        return {users: []};
    }

    payload = payload.filter((user, index, self) => index === self.findIndex((u) => u.integrationId === user.integrationId && u.id === user.id));

    let usersInserted = await tx
        .insert(user)
        .values(payload)
        .onConflictDoUpdate({
            target: [user.integrationId, user.id],
            set: {
                login: sql`EXCLUDED.login`,
                type: sql`EXCLUDED.type`,
            },
            setWhere: sql`${user.login} IS DISTINCT FROM EXCLUDED.login OR
                        ${user.type} IS DISTINCT FROM EXCLUDED.type`,
        })
        .returning();

    if (usersInserted.length === payload.length) {
        return {users: usersInserted};
    }

    usersInserted = await tx
        .select()
        .from(user)
        .where(
            inArray(
                user.id,
                payload.map((u) => u.id),
            ),
        );

    if (!usersInserted || usersInserted.length === 0) {
        throw new Error(`Failed to insert or find users with id ${payload.map((u) => u.id).join(', ')}`);
    }

    if (usersInserted.length !== payload.length) {
        throw new Error(`Mismatch in number of users inserted vs found. Expected: ${payload.length}, Found: ${usersInserted.length}`);
    }

    return {users: usersInserted};
};

export const upsertWorkflowRuns = async (
    tx: RdsTransaction,
    payload: WorkflowRunInsert[],
): Promise<{workflowRuns: WorkflowRun[]; stale: boolean}> => {
    if (payload.length === 0) {
        return {workflowRuns: [], stale: false};
    }

    // Sort by updatedAt desc and filter out duplicates to ensure we attempt to insert the most recent run data for each unique workflow run (identified by integrationId + id)
    payload = payload
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .filter((run, index, self) => index === self.findIndex((r) => r.integrationId === run.integrationId && r.id === run.id));

    const workflowRunsInserted = await tx
        .insert(workflowRuns)
        .values(payload)
        .onConflictDoUpdate({
            target: [workflowRuns.integrationId, workflowRuns.id],
            set: {
                updatedAt: sql`EXCLUDED.updated_at`,
                runAttempt: sql`EXCLUDED.run_attempt`,
                status: sql`EXCLUDED.status`,
                conclusion: sql`EXCLUDED.conclusion`,
                runStartedAt: sql`EXCLUDED.run_started_at`,
                event: sql`EXCLUDED.event`,
            },
            setWhere: sql`${workflowRuns.updatedAt} <= EXCLUDED.updated_at OR ${workflowRuns.conclusion} IS NULL`,
        })
        .returning();

    if (workflowRunsInserted.length === payload.length) {
        return {workflowRuns: workflowRunsInserted, stale: false};
    }

    const workflowRunIds = payload.map((w) => w.id);
    const workflowRunsFound = await tx.select().from(workflowRuns).where(inArray(workflowRuns.id, workflowRunIds));

    if (!workflowRunsFound || workflowRunsFound.length === 0) {
        throw new Error(`Failed to insert or find workflow runs with id ${payload.map((w) => w.id).join(', ')}`);
    }

    if (workflowRunsFound.length !== payload.length) {
        throw new Error(`Mismatch in number of workflow runs inserted vs found. Expected: ${payload.length}, Found: ${workflowRunsFound.length}`);
    }

    return {workflowRuns: workflowRunsFound, stale: true};
};

export const upsertWorkflowRunPullRequestAssociations = async (
    tx: RdsTransaction,
    payload: WorkflowRunPullRequestInsert[],
): Promise<{workflowRunPullRequests: WorkflowRunPullRequestSelect[]}> => {
    if (payload.length === 0) {
        return {workflowRunPullRequests: []};
    }

    payload = payload.filter(
        (assoc, index, self) =>
            index ===
            self.findIndex(
                (a) => a.integrationId === assoc.integrationId && a.workflowRunId === assoc.workflowRunId && a.pullRequestId === assoc.pullRequestId,
            ),
    );

    const workflowRunPullRequestsInserted = await tx.insert(workflowRunPullRequests).values(payload).onConflictDoNothing().returning();

    if (workflowRunPullRequestsInserted.length === payload.length) {
        return {workflowRunPullRequests: workflowRunPullRequestsInserted};
    }

    const workflowRunPullRequestIds = payload.map((w) => w.pullRequestId);
    const workflowRunPullRequestsFound = await tx
        .select()
        .from(workflowRunPullRequests)
        .where(
            and(
                inArray(workflowRunPullRequests.pullRequestId, workflowRunPullRequestIds),
                inArray(
                    workflowRunPullRequests.workflowRunId,
                    payload.map((w) => w.workflowRunId),
                ),
            ),
        );

    if (!workflowRunPullRequestsFound || workflowRunPullRequestsFound.length === 0) {
        throw new Error(`Failed to insert or find workflow run pull requests with id ${payload.map((w) => w.pullRequestId).join(', ')}`);
    }

    if (workflowRunPullRequestsFound.length !== payload.length) {
        throw new Error(
            `Mismatch in number of workflow run pull requests inserted vs found. Expected: ${payload.length}, Found: ${workflowRunPullRequestsFound.length}`,
        );
    }

    return {workflowRunPullRequests: workflowRunPullRequestsFound};
};

export const upsertWorkflowJobs = async (
    tx: RdsTransaction,
    payload: WorkflowJobInsert[],
): Promise<{workflowJobs: WorkflowJob[]; stale: boolean}> => {
    if (payload.length === 0) {
        return {workflowJobs: [], stale: false};
    }

    // Sort by action: 1. waiting 2. queued 3. in_progress 4. completed, and then by
    // completedAt desc and filter out duplicates to ensure we attempt to insert the most recent data for each unique workflow job (identified by integrationId + id)
    payload = payload
        .sort((a, b) => {
            const statusOrder = ['waiting', 'queued', 'in_progress', 'completed'];
            const statusComparison = statusOrder.indexOf(b.status) - statusOrder.indexOf(a.status);
            if (statusComparison !== 0) {
                return statusComparison;
            }
            const aCompletedAt = a.completedAt ? a.completedAt.getTime() : 0;
            const bCompletedAt = b.completedAt ? b.completedAt.getTime() : 0;
            return bCompletedAt - aCompletedAt;
        })
        .filter((job, index, self) => index === self.findIndex((j) => j.integrationId === job.integrationId && j.id === job.id));

    const workflowJobsImported = await tx
        .insert(workflowJobs)
        .values(payload)
        .onConflictDoUpdate({
            target: [workflowJobs.integrationId, workflowJobs.id],
            set: {
                completedAt: sql`EXCLUDED.completed_at`,
                conclusion: sql`EXCLUDED.conclusion`,
                status: sql`EXCLUDED.status`,
            },
            setWhere: sql`${workflowJobs.completedAt} IS NULL OR ${workflowJobs.completedAt} < EXCLUDED.completed_at`,
        })
        .returning();

    if (workflowJobsImported.length === payload.length) {
        return {workflowJobs: workflowJobsImported, stale: false};
    }

    const workflowJobIds = payload.map((w) => w.id);
    const workflowJobsFound = await tx.select().from(workflowJobs).where(inArray(workflowJobs.id, workflowJobIds));

    if (!workflowJobsFound || workflowJobsFound.length === 0) {
        throw new Error(`Failed to insert or find workflow jobs with id ${payload.map((w) => w.id).join(', ')}`);
    }

    if (workflowJobsFound.length !== payload.length) {
        throw new Error(`Mismatch in number of workflow jobs inserted vs found. Expected: ${payload.length}, Found: ${workflowJobsFound.length}`);
    }

    return {workflowJobs: workflowJobsFound, stale: true};
};

export const upsertPullRequests = async (
    tx: RdsTransaction,
    payload: PullRequestInsert[],
): Promise<{pullRequests: PullRequest[]; stale: boolean}> => {
    if (payload.length === 0) {
        return {pullRequests: [], stale: false};
    }

    payload = payload
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .filter((pr, index, self) => index === self.findIndex((p) => p.integrationId === pr.integrationId && p.id === pr.id));

    const result = await tx
        .insert(pullRequests)
        .values(payload)
        .onConflictDoUpdate({
            target: [pullRequests.integrationId, pullRequests.id],
            set: {
                state: sql`EXCLUDED.state`,
                title: sql`EXCLUDED.title`,
                body: sql`EXCLUDED.body`,
                draft: sql`EXCLUDED.draft`,
                merged: sql`EXCLUDED.merged`,
                updatedAt: sql`EXCLUDED.updated_at`,
                closedAt: sql`EXCLUDED.closed_at`,
                mergedAt: sql`EXCLUDED.merged_at`,
                additions: sql`EXCLUDED.additions`,
                deletions: sql`EXCLUDED.deletions`,
                changedFiles: sql`EXCLUDED.changed_files`,
                commits: sql`EXCLUDED.commits`,
            },
            setWhere: sql`${pullRequests.updatedAt} <= EXCLUDED.updated_at`,
        })
        .returning();

    if (result.length === payload.length) {
        return {pullRequests: result, stale: false};
    }

    const pullRequestIds = payload.map((pr) => pr.id);
    const pullRequestsFound = await tx.select().from(pullRequests).where(inArray(pullRequests.id, pullRequestIds));

    if (!pullRequestsFound || pullRequestsFound.length === 0) {
        throw new Error(`Failed to insert or find pull requests with id ${payload.map((pr) => pr.id).join(', ')}`);
    }

    if (pullRequestsFound.length !== payload.length) {
        throw new Error(`Mismatch in number of pull requests inserted vs found. Expected: ${payload.length}, Found: ${pullRequestsFound.length}`);
    }

    return {pullRequests: pullRequestsFound, stale: true};
};

export const upsertPullRequestReviews = async (
    tx: RdsTransaction,
    payload: PullRequestReviewInsert[],
): Promise<{pullRequestReviews: PullRequestReview[]}> => {
    if (payload.length === 0) {
        return {pullRequestReviews: []};
    }

    const result = await tx
        .insert(pullRequestReviews)
        .values(payload)
        .onConflictDoUpdate({
            target: [pullRequestReviews.integrationId, pullRequestReviews.id],
            set: {
                state: sql`EXCLUDED.state`,
                body: sql`EXCLUDED.body`,
                submittedAt: sql`EXCLUDED.submitted_at`,
            },
            setWhere: sql`${pullRequestReviews.submittedAt} <= EXCLUDED.submitted_at`,
        })
        .returning();

    if (result.length === payload.length) {
        return {pullRequestReviews: result};
    }

    const reviewIds = payload.map((r) => r.id);
    const pullRequestReviewsFound = await tx.select().from(pullRequestReviews).where(inArray(pullRequestReviews.id, reviewIds));

    if (!pullRequestReviewsFound || pullRequestReviewsFound.length === 0) {
        throw new Error(`Failed to insert or find pull request reviews with id ${payload.map((r) => r.id).join(', ')}`);
    }

    if (pullRequestReviewsFound.length !== payload.length) {
        throw new Error(
            `Mismatch in number of pull request reviews inserted vs found. Expected: ${payload.length}, Found: ${pullRequestReviewsFound.length}`,
        );
    }

    return {pullRequestReviews: pullRequestReviewsFound};
};
