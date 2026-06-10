import {proxyFetch} from '@/shared/clients/proxy-fetch';

/**
 * Single-page GitHub REST fetchers for the serverless backfill worker.
 *
 * Lifted from `packages/import/src/github.ts`, with two changes required for
 * the in-VPC Lambda environment:
 *   1. The token is passed in explicitly (resolved per-integration from Secrets
 *      Manager) instead of read from `process.env.GITHUB_TOKEN`.
 *   2. All requests go through `proxyFetch` so they egress via the HTTP proxy
 *      Lambda (GitHub is IPv4-only and unreachable directly from the VPC).
 *
 * Because `proxyFetch` performs no retries when the proxy is enabled, this
 * module applies its own bounded retry for transient 5xx / rate-limit
 * responses. Anything beyond the inline budget is thrown so SQS retries the
 * whole task after the visibility timeout.
 */

const GITHUB_API_BASE = 'https://api.github.com';
const PER_PAGE = 100;
/**
 * GitHub's list-workflow-runs endpoint only exposes the first 1000 results for
 * any single query, regardless of the reported `total_count`. Pagination must
 * stop at this cap; runs beyond it require a narrower date window.
 */
export const GITHUB_RUNS_RESULT_CAP = 1000;
const MAX_ATTEMPTS = 4;
const MAX_INLINE_WAIT_MS = 20_000;
const MAX_BACKOFF_MS = 8_000;

export class GitHubApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        /**
         * When the failure is a rate limit whose reset is further out than the
         * inline retry budget, the number of milliseconds to wait before
         * retrying (i.e. until the limit resets). Lets the SQS worker defer
         * redelivery to the reset instead of churning through retries within
         * the locked window. Undefined for non-rate-limit errors.
         */
        readonly retryAfterMs?: number,
    ) {
        super(message);
        this.name = 'GitHubApiError';
    }
}

const buildHeaders = (token: string): Record<string, string> => ({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Detects a GitHub rate-limit response, covering both limit types:
 *   - primary: 403/429 with the primary quota exhausted (x-ratelimit-remaining <= 0)
 *   - secondary (abuse): 403/429 carrying a Retry-After header. These can fire
 *     while the primary quota still has requests remaining, so the Retry-After
 *     header — not the remaining count — is the reliable signal.
 */
const isRateLimited = (response: Response): boolean => {
    if (response.status !== 403 && response.status !== 429) return false;
    if (response.headers.get('retry-after') !== null) return true;
    const remaining = response.headers.get('x-ratelimit-remaining');
    return remaining !== null && parseInt(remaining, 10) <= 0;
};

export const isRetryable = (response: Response): boolean => response.status >= 500 || response.status === 429 || isRateLimited(response);

export const computeWaitMs = (response: Response, attempt: number): number => {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter !== null) {
        const seconds = Number(retryAfter);
        if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
    }

    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');
    if (remaining !== null && parseInt(remaining, 10) <= 0 && reset !== null) {
        const resetMs = parseInt(reset, 10) * 1000;
        return Math.max(0, resetMs - Date.now()) + 1000;
    }

    const backoff = Math.min(MAX_BACKOFF_MS, 500 * 2 ** (attempt - 1));
    const jitter = Math.random() * 0.3 * backoff;
    return backoff + jitter;
};

const fetchJson = async <T>(path: string, token: string): Promise<T> => {
    const url = `${GITHUB_API_BASE}${path}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const response = await proxyFetch(url, {method: 'GET', headers: buildHeaders(token)});

        if (response.ok) {
            return (await response.json()) as T;
        }

        if (isRetryable(response)) {
            const waitMs = computeWaitMs(response, attempt);

            // A wait beyond the inline budget means the reset is far out (a
            // primary rate-limit reset can be ~1h away). Don't burn attempts
            // sleeping or looping against a locked window — surface the wait so
            // the worker can defer the SQS message until the limit resets.
            if (waitMs > MAX_INLINE_WAIT_MS) {
                const body = await response.text().catch(() => '');
                throw new GitHubApiError(`GitHub API error ${response.status} for ${url}: ${body}`, response.status, waitMs);
            }

            // Short, transient wait (5xx backoff, brief secondary limit): retry inline.
            if (attempt < MAX_ATTEMPTS) {
                await sleep(waitMs);
                continue;
            }
        }

        const body = await response.text().catch(() => '');
        throw new GitHubApiError(`GitHub API error ${response.status} for ${url}: ${body}`, response.status);
    }

    throw new GitHubApiError(`GitHub API failed after ${MAX_ATTEMPTS} attempts for ${url}`, 0);
};

const enc = encodeURIComponent;

export type GitHubRepoSummary = {
    id: number;
    name: string;
    full_name: string;
    topics?: string[];
    archived: boolean;
    disabled: boolean;
    visibility?: string;
};

/** Full repository object — cached per `owner/repo` for the lifetime of the container. */
const repoCache = new Map<string, any>();

export const fetchRepo = async (owner: string, repo: string, token: string): Promise<any> => {
    const key = `${owner}/${repo}`;
    const cached = repoCache.get(key);
    if (cached) return cached;

    const fullRepo = await fetchJson<any>(`/repos/${enc(owner)}/${enc(repo)}`, token);
    repoCache.set(key, fullRepo);
    return fullRepo;
};

const listReposPaginated = async (path: (page: number) => string, token: string): Promise<GitHubRepoSummary[]> => {
    const all: GitHubRepoSummary[] = [];
    let page = 1;

    while (true) {
        const repos = await fetchJson<GitHubRepoSummary[]>(path(page), token);
        all.push(...repos);
        if (repos.length < PER_PAGE) break;
        page++;
    }

    return all;
};

/**
 * Lists repositories for an owner, trying the org endpoint first and falling
 * back to the user endpoint on a 404 (mirrors the CLI's `fetchOwnerRepos`).
 */
export const listOwnerRepos = async (owner: string, token: string): Promise<GitHubRepoSummary[]> => {
    try {
        return await listReposPaginated((page) => `/orgs/${enc(owner)}/repos?type=all&sort=full_name&per_page=${PER_PAGE}&page=${page}`, token);
    } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) {
            return listReposPaginated((page) => `/users/${enc(owner)}/repos?type=owner&sort=full_name&per_page=${PER_PAGE}&page=${page}`, token);
        }
        throw error;
    }
};

export const filterReposByTopics = (repos: GitHubRepoSummary[], topics: string[]): GitHubRepoSummary[] => {
    const lowerTopics = topics.map((topic) => topic.toLowerCase());
    return repos.filter((repo) => {
        if (repo.archived || repo.disabled) return false;
        return repo.topics?.some((topic) => lowerTopics.includes(topic.toLowerCase()));
    });
};

export type WorkflowRunsPage = {
    runs: any[];
    totalCount: number;
};

export const fetchWorkflowRunsPage = async (
    owner: string,
    repo: string,
    options: {createdFilter?: string; page: number},
    token: string,
): Promise<WorkflowRunsPage> => {
    const params = new URLSearchParams();
    if (options.createdFilter) params.set('created', options.createdFilter);
    params.set('page', String(options.page));
    params.set('per_page', String(PER_PAGE));

    const response = await fetchJson<{total_count: number; workflow_runs: any[]}>(`/repos/${enc(owner)}/${enc(repo)}/actions/runs?${params}`, token);

    return {runs: response.workflow_runs, totalCount: response.total_count};
};

export const fetchWorkflowRun = async (owner: string, repo: string, runId: number, token: string): Promise<any> => {
    return fetchJson<any>(`/repos/${enc(owner)}/${enc(repo)}/actions/runs/${runId}`, token);
};

export const fetchWorkflowJobs = async (owner: string, repo: string, runId: number, token: string): Promise<any[]> => {
    const allJobs: any[] = [];
    let page = 1;

    while (true) {
        const response = await fetchJson<{total_count: number; jobs: any[]}>(
            `/repos/${enc(owner)}/${enc(repo)}/actions/runs/${runId}/jobs?page=${page}&per_page=${PER_PAGE}`,
            token,
        );
        allJobs.push(...response.jobs);
        if (allJobs.length >= response.total_count || response.jobs.length < PER_PAGE) break;
        page++;
    }

    return allJobs;
};

export const fetchPullRequestsPage = async (owner: string, repo: string, page: number, token: string): Promise<any[]> => {
    const params = new URLSearchParams();
    params.set('state', 'all');
    params.set('sort', 'updated');
    params.set('direction', 'desc');
    params.set('page', String(page));
    params.set('per_page', String(PER_PAGE));

    return fetchJson<any[]>(`/repos/${enc(owner)}/${enc(repo)}/pulls?${params}`, token);
};

export const fetchPullRequest = async (owner: string, repo: string, pullNumber: number, token: string): Promise<any> => {
    return fetchJson<any>(`/repos/${enc(owner)}/${enc(repo)}/pulls/${pullNumber}`, token);
};

export const fetchPullRequestReviews = async (owner: string, repo: string, pullNumber: number, token: string): Promise<any[]> => {
    const allReviews: any[] = [];
    let page = 1;

    while (true) {
        const reviews = await fetchJson<any[]>(
            `/repos/${enc(owner)}/${enc(repo)}/pulls/${pullNumber}/reviews?per_page=${PER_PAGE}&page=${page}`,
            token,
        );
        allReviews.push(...reviews);
        if (reviews.length < PER_PAGE) break;
        page++;
    }

    return allReviews;
};

export const PER_PAGE_SIZE = PER_PAGE;
