import {insertEvent} from '@/domains/webhooks/importers/index';
import {getLogger} from '@/shared/logger';

import {
    fetchPullRequest,
    fetchPullRequestReviews,
    fetchPullRequestsPage,
    fetchWorkflowJobs,
    fetchWorkflowRunsPage,
    filterReposByTopics,
    GITHUB_RUNS_RESULT_CAP,
    listOwnerRepos,
    PER_PAGE_SIZE,
} from './github';
import {resolvePat} from './pat-resolver';
import {resolveRepo} from './stored-repo';
import type {BackfillEventType, BackfillTask, DiscoverTask, PrsPageTask, PullRequestTask, RepoTask, RunsPageTask, WorkflowRunTask} from './tasks';
import {transformPullRequest, transformPullRequestReview, transformWorkflowJob, transformWorkflowRun} from './transform';

const logger = getLogger();

type RunContext = {
    integrationId: string;
    owner: string;
    eventTypes: BackfillEventType[];
    since?: string;
    until?: string;
};

const baseContext = (task: BackfillTask): RunContext => ({
    integrationId: task.integrationId,
    owner: task.owner,
    eventTypes: task.eventTypes,
    since: task.since,
    until: task.until,
});

const wants = (eventTypes: BackfillEventType[], ...types: BackfillEventType[]): boolean => types.some((type) => eventTypes.includes(type));

/** Builds the GitHub `created` query filter for workflow runs from since/until. */
const buildCreatedFilter = (since?: string, until?: string): string | undefined => {
    if (since && until) return `${since}..${until}`;
    if (since) return `>=${since}`;
    if (until) return `<=${until}`;
    return undefined;
};

const handleDiscover = async (task: DiscoverTask, token: string): Promise<RepoTask[]> => {
    const ctx = baseContext(task);

    let repos: string[];
    if (task.repo) {
        repos = [task.repo];
    } else {
        const summaries = await listOwnerRepos(task.owner, token);
        if (task.topics && task.topics.length > 0) {
            repos = filterReposByTopics(summaries, task.topics).map((repo) => repo.name);
        } else {
            repos = summaries.filter((repo) => !repo.archived && !repo.disabled).map((repo) => repo.name);
        }
    }

    logger.info('Backfill discover resolved repositories', {owner: task.owner, repoCount: repos.length, integrationId: task.integrationId});

    return repos.map((repo) => ({...ctx, kind: 'repo', repo}));
};

const handleRepo = (task: RepoTask): (RunsPageTask | PrsPageTask)[] => {
    const ctx = baseContext(task);
    const followUps: (RunsPageTask | PrsPageTask)[] = [];

    if (wants(task.eventTypes, 'workflow_run', 'workflow_job')) {
        followUps.push({...ctx, kind: 'runs_page', repo: task.repo, page: 1, createdFilter: buildCreatedFilter(task.since, task.until)});
    }
    if (wants(task.eventTypes, 'pull_request', 'pull_request_review')) {
        followUps.push({...ctx, kind: 'prs_page', repo: task.repo, page: 1});
    }

    return followUps;
};

const handleRunsPage = async (task: RunsPageTask, token: string): Promise<(WorkflowRunTask | RunsPageTask)[]> => {
    const ctx = baseContext(task);
    const {runs, totalCount} = await fetchWorkflowRunsPage(task.owner, task.repo, {createdFilter: task.createdFilter, page: task.page}, token);

    if (task.page === 1 && totalCount > GITHUB_RUNS_RESULT_CAP) {
        logger.warn(
            "Workflow run count exceeds GitHub's accessible result cap; runs beyond the cap will be skipped. Narrow the date window (since/until) to capture them.",
            {
                owner: task.owner,
                repo: task.repo,
                totalCount,
                cap: GITHUB_RUNS_RESULT_CAP,
                createdFilter: task.createdFilter,
                integrationId: task.integrationId,
            },
        );
    }

    // Thread the full run object (already returned by the page listing) onto each
    // task so the handler doesn't re-fetch it — the list and single-run GET
    // return the identical `workflow-run` shape.
    const followUps: (WorkflowRunTask | RunsPageTask)[] = runs.map((run) => ({...ctx, kind: 'workflow_run', repo: task.repo, run}));

    // GitHub caps accessible runs at GITHUB_RUNS_RESULT_CAP, so stop there even
    // if totalCount is higher (further pages return empty).
    const reachableCount = Math.min(totalCount, GITHUB_RUNS_RESULT_CAP);
    const hasNextPage = runs.length === PER_PAGE_SIZE && task.page * PER_PAGE_SIZE < reachableCount;
    if (hasNextPage) {
        followUps.push({...ctx, kind: 'runs_page', repo: task.repo, page: task.page + 1, createdFilter: task.createdFilter});
    }

    return followUps;
};

const handlePrsPage = async (task: PrsPageTask, token: string): Promise<(PullRequestTask | PrsPageTask)[]> => {
    const ctx = baseContext(task);
    const prs = await fetchPullRequestsPage(task.owner, task.repo, task.page, token);

    if (prs.length === 0) return [];

    const inRange = prs.filter((pr) => {
        if (task.since && pr.updated_at < task.since) return false;
        if (task.until && pr.updated_at > `${task.until}T23:59:59Z`) return false;
        return true;
    });

    const followUps: (PullRequestTask | PrsPageTask)[] = inRange.map((pr) => ({
        ...ctx,
        kind: 'pull_request',
        repo: task.repo,
        pullNumber: pr.number,
    }));

    // PRs are sorted by updated_at desc: once the oldest PR on the page predates
    // `since`, no later page can contain in-range PRs.
    const oldestUpdatedAt = prs[prs.length - 1].updated_at;
    const reachedSinceBoundary = task.since !== undefined && oldestUpdatedAt < task.since;
    const hasNextPage = prs.length === PER_PAGE_SIZE && !reachedSinceBoundary;
    if (hasNextPage) {
        followUps.push({...ctx, kind: 'prs_page', repo: task.repo, page: task.page + 1});
    }

    return followUps;
};

const handleWorkflowRun = async (task: WorkflowRunTask, token: string): Promise<void> => {
    // The run is threaded in from the page listing, so it never needs a GitHub
    // fetch. The repository sub-dependency is reused from Postgres when it has
    // already been imported, falling back to GitHub only when it is missing.
    const apiRun = task.run;
    const fullRepo = await resolveRepo(task.integrationId, task.owner, task.repo, token);

    if (wants(task.eventTypes, 'workflow_run')) {
        const workflowMeta = {id: apiRun.workflow_id, name: apiRun.name, path: apiRun.path};
        await insertEvent(task.integrationId, 'workflow_run', transformWorkflowRun(apiRun, fullRepo, workflowMeta));
    }

    if (wants(task.eventTypes, 'workflow_job')) {
        const jobs = await fetchWorkflowJobs(task.owner, task.repo, apiRun.id, token);
        const sender = apiRun.triggering_actor ?? apiRun.actor;
        for (const job of jobs) {
            await insertEvent(task.integrationId, 'workflow_job', transformWorkflowJob(job, fullRepo, sender));
        }
    }
};

const handlePullRequest = async (task: PullRequestTask, token: string): Promise<void> => {
    // The repository (and its organization) is reused from Postgres when already
    // imported; only the PR detail — which the list endpoint omits diff stats
    // for — is always fetched fresh.
    const [fullPR, fullRepo] = await Promise.all([
        fetchPullRequest(task.owner, task.repo, task.pullNumber, token),
        resolveRepo(task.integrationId, task.owner, task.repo, token),
    ]);

    if (wants(task.eventTypes, 'pull_request')) {
        await insertEvent(task.integrationId, 'pull_request', transformPullRequest(fullPR, fullRepo));
    }

    if (wants(task.eventTypes, 'pull_request_review')) {
        const reviews = await fetchPullRequestReviews(task.owner, task.repo, task.pullNumber, token);
        for (const review of reviews) {
            if (!review.submitted_at) continue;
            await insertEvent(task.integrationId, 'pull_request_review', transformPullRequestReview(review, fullPR, fullRepo));
        }
    }
};

/**
 * Routes a single backfill task to its handler and returns any follow-up tasks
 * to enqueue. Per-entity tasks (`workflow_run`, `pull_request`) write straight
 * to the database via `insertEvent` and emit no follow-ups.
 *
 * Ingestion is idempotent (upsert freshness guards), so retried or duplicate
 * tasks are safe.
 */
export const routeTask = async (task: BackfillTask): Promise<BackfillTask[]> => {
    const token = await resolvePat(task.integrationId);

    switch (task.kind) {
        case 'discover':
            return handleDiscover(task, token);
        case 'repo':
            return handleRepo(task);
        case 'runs_page':
            return handleRunsPage(task, token);
        case 'prs_page':
            return handlePrsPage(task, token);
        case 'workflow_run':
            await handleWorkflowRun(task, token);
            return [];
        case 'pull_request':
            await handlePullRequest(task, token);
            return [];
    }
};
