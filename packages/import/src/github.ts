const GITHUB_API_BASE = 'https://api.github.com';

const getHeaders = (): Record<string, string> => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is required');
    }
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
    };
};

const handleRateLimit = async (response: Response): Promise<void> => {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAt = response.headers.get('x-ratelimit-reset');

    if (remaining !== null && parseInt(remaining, 10) <= 5 && resetAt) {
        const resetTime = parseInt(resetAt, 10) * 1000;
        const waitMs = Math.max(resetTime - Date.now(), 0) + 1000;
        console.log(`Rate limit nearly exhausted. Waiting ${Math.ceil(waitMs / 1000)}s...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
};

const fetchJson = async <T>(url: string, maxRetries = 5): Promise<T> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, {headers: getHeaders()});
        await handleRateLimit(response);

        if (response.ok) {
            return response.json() as Promise<T>;
        }

        const body = await response.text();

        if (response.status >= 500 && attempt < maxRetries) {
            const backoffMs = Math.min(1000 * 2 ** attempt, 30000);
            console.log(`GitHub API ${response.status} for ${url}. Retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
        }

        throw new Error(`GitHub API error ${response.status} for ${url}: ${body}`);
    }

    throw new Error(`GitHub API failed after ${maxRetries} retries for ${url}`);
};

export interface GitHubWorkflowRunsResponse {
    total_count: number;
    workflow_runs: any[];
}

export interface GitHubWorkflowJobsResponse {
    total_count: number;
    jobs: any[];
}

export const fetchRepo = async (owner: string, repo: string): Promise<any> => {
    return fetchJson(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
};

export const fetchWorkflowRuns = async (
    owner: string,
    repo: string,
    options: {created?: string; page?: number; per_page?: number} = {},
): Promise<GitHubWorkflowRunsResponse> => {
    const params = new URLSearchParams();
    if (options.created) params.set('created', options.created);
    params.set('page', String(options.page ?? 1));
    params.set('per_page', String(options.per_page ?? 100));

    const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?${params}`;
    return fetchJson<GitHubWorkflowRunsResponse>(url);
};

export const fetchAllWorkflowRuns = async (owner: string, repo: string, created?: string): Promise<any[]> => {
    const allRuns: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const response = await fetchWorkflowRuns(owner, repo, {
            created,
            page,
            per_page: perPage,
        });
        allRuns.push(...response.workflow_runs);

        console.log(`  Fetched page ${page} of runs (${allRuns.length}/${response.total_count})`);

        if (allRuns.length >= response.total_count || response.workflow_runs.length < perPage) {
            break;
        }
        page++;
    }

    return allRuns;
};

export const fetchWorkflowJobs = async (owner: string, repo: string, runId: number): Promise<any[]> => {
    const allJobs: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('per_page', String(perPage));

        const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/jobs?${params}`;
        const response = await fetchJson<GitHubWorkflowJobsResponse>(url);
        allJobs.push(...response.jobs);

        if (allJobs.length >= response.total_count || response.jobs.length < perPage) {
            break;
        }
        page++;
    }

    return allJobs;
};

export const fetchWorkflow = async (owner: string, repo: string, workflowId: number): Promise<any> => {
    return fetchJson(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${workflowId}`);
};

export interface GitHubPullRequestsResponse {
    total_count: number;
    items: any[];
}

export const fetchPullRequests = async (
    owner: string,
    repo: string,
    options: {state?: string; sort?: string; direction?: string; page?: number; per_page?: number} = {},
): Promise<any[]> => {
    const params = new URLSearchParams();
    params.set('state', options.state ?? 'all');
    params.set('sort', options.sort ?? 'updated');
    params.set('direction', options.direction ?? 'desc');
    params.set('page', String(options.page ?? 1));
    params.set('per_page', String(options.per_page ?? 100));

    const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${params}`;
    return fetchJson<any[]>(url);
};

export const fetchPullRequest = async (owner: string, repo: string, pullNumber: number): Promise<any> => {
    return fetchJson(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`);
};

export const fetchPullRequestReviews = async (owner: string, repo: string, pullNumber: number): Promise<any[]> => {
    const allReviews: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const params = new URLSearchParams();
        params.set('per_page', String(perPage));
        params.set('page', String(page));

        const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/reviews?${params}`;
        const reviews = await fetchJson<any[]>(url);
        allReviews.push(...reviews);

        if (reviews.length < perPage) break;
        page++;
    }

    return allReviews;
};

export interface GitHubOrgRepo {
    id: number;
    name: string;
    full_name: string;
    topics: string[];
    archived: boolean;
    disabled: boolean;
    visibility: string;
}

export const fetchOrgRepos = async (org: string): Promise<GitHubOrgRepo[]> => {
    const allRepos: GitHubOrgRepo[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const params = new URLSearchParams();
        params.set('type', 'all');
        params.set('sort', 'full_name');
        params.set('per_page', String(perPage));
        params.set('page', String(page));

        const url = `${GITHUB_API_BASE}/orgs/${encodeURIComponent(org)}/repos?${params}`;
        const repos = await fetchJson<GitHubOrgRepo[]>(url);
        allRepos.push(...repos);

        console.log(`  Fetched page ${page} of org repos (${allRepos.length} so far)`);

        if (repos.length < perPage) break;
        page++;
    }

    return allRepos;
};

export const fetchUserRepos = async (username: string): Promise<GitHubOrgRepo[]> => {
    const allRepos: GitHubOrgRepo[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const params = new URLSearchParams();
        params.set('type', 'owner');
        params.set('sort', 'full_name');
        params.set('per_page', String(perPage));
        params.set('page', String(page));

        const url = `${GITHUB_API_BASE}/users/${encodeURIComponent(username)}/repos?${params}`;
        const repos = await fetchJson<GitHubOrgRepo[]>(url);
        allRepos.push(...repos);

        console.log(`  Fetched page ${page} of user repos (${allRepos.length} so far)`);

        if (repos.length < perPage) break;
        page++;
    }

    return allRepos;
};

export const fetchOwnerRepos = async (owner: string): Promise<GitHubOrgRepo[]> => {
    try {
        return await fetchOrgRepos(owner);
    } catch (err: unknown) {
        const isNotFound = err instanceof Error && err.message.includes('error 404');
        if (isNotFound) {
            console.log(`  "${owner}" is not an org, trying as user...`);
            return fetchUserRepos(owner);
        }
        throw err;
    }
};

export const filterReposByTopics = (repos: GitHubOrgRepo[], topics: string[]): GitHubOrgRepo[] => {
    const lowerTopics = topics.map((t) => t.toLowerCase());
    return repos.filter((repo) => {
        if (repo.archived || repo.disabled) return false;
        return repo.topics?.some((t) => lowerTopics.includes(t.toLowerCase()));
    });
};

export const fetchAllPullRequests = async (owner: string, repo: string, since?: string, until?: string): Promise<any[]> => {
    const allPRs: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const prs = await fetchPullRequests(owner, repo, {
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            page,
            per_page: perPage,
        });
        if (prs.length === 0) break;

        // Filter by date range based on updated_at
        const filtered = prs.filter((pr) => {
            const updatedAt = pr.updated_at;
            if (since && updatedAt < since) return false;
            if (until && updatedAt > until + 'T23:59:59Z') return false;
            return true;
        });
        allPRs.push(...filtered);

        console.log(`  Fetched page ${page} of PRs (${allPRs.length} matching so far)`);

        // If the oldest PR on this page is before our `since` date, stop paginating
        if (since && prs[prs.length - 1].updated_at < since) break;
        if (prs.length < perPage) break;
        page++;
    }

    return allPRs;
};
