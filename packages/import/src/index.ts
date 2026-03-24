import {insertEvent} from '@/domains/webhooks/importers';
import {
    fetchAllPullRequests,
    fetchAllWorkflowRuns,
    fetchOrgRepos,
    fetchPullRequest,
    fetchPullRequestReviews,
    fetchRepo,
    fetchWorkflowJobs,
    filterReposByTopics,
} from './github';
import {transformPullRequest, transformPullRequestReview, transformWorkflowJob, transformWorkflowRun} from './transform';

const SUPPORTED_EVENT_TYPES = ['workflow_run', 'workflow_job', 'pull_request', 'pull_request_review'] as const;
type SupportedEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
    return value;
};

const parseEventTypes = (raw: string | undefined): SupportedEventType[] => {
    if (!raw) return [...SUPPORTED_EVENT_TYPES];

    const types = raw.split(',').map((t) => t.trim().toLowerCase());
    const invalid = types.filter((t) => !(SUPPORTED_EVENT_TYPES as readonly string[]).includes(t));
    if (invalid.length > 0) {
        console.error(`Unsupported event type(s): ${invalid.join(', ')}`);
        console.error(`Supported types: ${SUPPORTED_EVENT_TYPES.join(', ')}`);
        process.exit(1);
    }
    return types as SupportedEventType[];
};

interface ImportConfig {
    integrationId: string;
    dryRun: boolean;
    concurrency: number;
    eventTypes: SupportedEventType[];
    createdFilter?: string;
    since?: string;
    until?: string;
}

interface ImportStats {
    runSuccessCount: number;
    runErrorCount: number;
    jobSuccessCount: number;
    jobErrorCount: number;
    prSuccessCount: number;
    prErrorCount: number;
    reviewSuccessCount: number;
    reviewErrorCount: number;
}

const importRepo = async (owner: string, repo: string, config: ImportConfig): Promise<ImportStats> => {
    const {integrationId, dryRun, concurrency, eventTypes, createdFilter, since, until} = config;

    console.log(`\n───────────────────────────────────────`);
    console.log(`Importing: ${owner}/${repo}`);
    console.log(`───────────────────────────────────────`);

    // Fetch full repository info (used in all event payloads)
    console.log('Fetching repository info...');
    const fullRepo = await fetchRepo(owner, repo);
    console.log(`  Repository: ${fullRepo.full_name} (id: ${fullRepo.id})`);

    const needsWorkflowData = eventTypes.includes('workflow_run') || eventTypes.includes('workflow_job');

    const stats: ImportStats = {
        runSuccessCount: 0,
        runErrorCount: 0,
        jobSuccessCount: 0,
        jobErrorCount: 0,
        prSuccessCount: 0,
        prErrorCount: 0,
        reviewSuccessCount: 0,
        reviewErrorCount: 0,
    };

    // ── Workflow runs & jobs ─────────────────────────────────────────
    if (needsWorkflowData) {
        console.log('\nFetching workflow runs...');
        const runs = await fetchAllWorkflowRuns(owner, repo, createdFilter);
        console.log(`  Total runs: ${runs.length}`);

        const processRun = async (run: any, index: number, total: number) => {
            const runLabel = `[${index + 1}/${total}] Run #${run.id} (${run.name})`;

            try {
                if (eventTypes.includes('workflow_run')) {
                    const workflowMeta = {id: run.workflow_id, name: run.name, path: run.path};
                    const runEvent = transformWorkflowRun(run, fullRepo, workflowMeta);

                    if (dryRun) {
                        console.log(`${runLabel} - DRY RUN (workflow_run, action=${runEvent.action})`);
                    } else {
                        await insertEvent(integrationId, 'workflow_run', runEvent);
                        console.log(`${runLabel} - inserted workflow_run`);
                    }
                } else {
                    console.log(`${runLabel} - skipped workflow_run`);
                }

                const jobStats = {successCount: 0, errorCount: 0};

                if (eventTypes.includes('workflow_job')) {
                    const jobs = await fetchWorkflowJobs(owner, repo, run.id);
                    const sender = run.triggering_actor ?? run.actor;

                    const jobResults = await Promise.allSettled(
                        jobs.map(async (job, j) => {
                            const jobEvent = transformWorkflowJob(job, fullRepo, sender);

                            if (dryRun) {
                                console.log(`  Job ${j + 1}/${jobs.length} #${job.id} (${job.name}) - DRY RUN`);
                            } else {
                                await insertEvent(integrationId, 'workflow_job', jobEvent);
                                console.log(`  Job ${j + 1}/${jobs.length} #${job.id} (${job.name}) - inserted`);
                            }
                            return job;
                        }),
                    );

                    jobResults.forEach((result, j) => {
                        if (result.status === 'fulfilled') {
                            jobStats.successCount++;
                        } else {
                            jobStats.errorCount++;
                            console.error(`  Job ${j + 1}/${jobs.length} #${jobs[j].id} (${jobs[j].name}) - ERROR: ${result.reason}`);
                        }
                    });
                }

                return {runSuccess: true, ...jobStats};
            } catch (runError) {
                console.error(`${runLabel} - ERROR: ${runError}`);
                return {runSuccess: false, successCount: 0, errorCount: 0};
            }
        };

        for (let i = 0; i < runs.length; i += concurrency) {
            const batch = runs.slice(i, i + concurrency);
            console.log(`\nProcessing runs ${i + 1} to ${Math.min(i + batch.length, runs.length)}...`);
            const results = await Promise.allSettled(batch.map((run, batchIndex) => processRun(run, i + batchIndex, runs.length)));

            results.forEach((result) => {
                if (result.status === 'fulfilled') {
                    const {runSuccess, successCount, errorCount} = result.value;
                    if (runSuccess) stats.runSuccessCount++;
                    else stats.runErrorCount++;
                    stats.jobSuccessCount += successCount;
                    stats.jobErrorCount += errorCount;
                } else {
                    stats.runErrorCount++;
                }
            });
        }
    }

    // ── Pull requests ────────────────────────────────────────────────
    if (eventTypes.includes('pull_request')) {
        console.log('\nFetching pull requests...');
        const prs = await fetchAllPullRequests(owner, repo, since, until);
        console.log(`  Total PRs: ${prs.length}`);

        for (let i = 0; i < prs.length; i += concurrency) {
            const batch = prs.slice(i, i + concurrency);
            console.log(`\nProcessing PRs ${i + 1} to ${Math.min(i + batch.length, prs.length)}...`);

            const results = await Promise.allSettled(
                batch.map(async (pr, batchIndex) => {
                    const idx = i + batchIndex;
                    const prLabel = `[${idx + 1}/${prs.length}] PR #${pr.number} (${pr.title})`;

                    // Fetch full PR detail to get additions, deletions, changed_files, commits
                    const fullPR = await fetchPullRequest(owner, repo, pr.number);
                    const prEvent = transformPullRequest(fullPR, fullRepo);

                    if (dryRun) {
                        console.log(`${prLabel} - DRY RUN (pull_request, action=${prEvent.action})`);
                    } else {
                        await insertEvent(integrationId, 'pull_request', prEvent);
                        console.log(`${prLabel} - inserted pull_request`);
                    }
                }),
            );

            results.forEach((result, j) => {
                if (result.status === 'fulfilled') {
                    stats.prSuccessCount++;
                } else {
                    stats.prErrorCount++;
                    const pr = batch[j];
                    console.error(`  PR #${pr.number} (${pr.title}) - ERROR: ${result.reason}`);
                }
            });
        }
    }

    // ── Pull request reviews ─────────────────────────────────────────
    if (eventTypes.includes('pull_request_review')) {
        console.log('\nFetching pull request reviews...');
        const prs = await fetchAllPullRequests(owner, repo, since, until);
        console.log(`  Total PRs to scan for reviews: ${prs.length}`);

        for (let i = 0; i < prs.length; i++) {
            const pr = prs[i];
            const prLabel = `[${i + 1}/${prs.length}] PR #${pr.number}`;

            try {
                const reviews = await fetchPullRequestReviews(owner, repo, pr.number);

                if (reviews.length === 0) {
                    console.log(`${prLabel} - no reviews`);
                    continue;
                }

                const fullPR = await fetchPullRequest(owner, repo, pr.number);

                for (const review of reviews) {
                    if (!review.submitted_at) continue;
                    const reviewEvent = transformPullRequestReview(review, fullPR, fullRepo);

                    if (dryRun) {
                        console.log(`${prLabel} review #${review.id} - DRY RUN`);
                    } else {
                        await insertEvent(integrationId, 'pull_request_review', reviewEvent);
                        console.log(`${prLabel} review #${review.id} by ${review.user.login} (${review.state}) - inserted`);
                    }
                    stats.reviewSuccessCount++;
                }
            } catch (err) {
                stats.reviewErrorCount++;
                console.error(`${prLabel} - ERROR fetching reviews: ${err}`);
            }
        }
    }

    return stats;
};

const main = async () => {
    const owner = required('GITHUB_OWNER');
    const integrationId = required('INTEGRATION_ID');
    required('GITHUB_TOKEN');

    const singleRepo = process.env.GITHUB_REPO;
    const topicFilter = process.env.GITHUB_TOPIC;

    // Optional date range filters
    const since = process.env.SINCE; // e.g. "2025-01-01"
    const until = process.env.UNTIL; // e.g. "2025-12-31"

    const dryRun = process.env.DRY_RUN === 'true';
    const concurrency = parseInt(process.env.CONCURRENCY || '1', 10);
    const eventTypes = parseEventTypes(process.env.EVENT_TYPES);

    // Build the `created` filter for the GitHub API
    let createdFilter: string | undefined;
    if (since && until) {
        createdFilter = `${since}..${until}`;
    } else if (since) {
        createdFilter = `>=${since}`;
    } else if (until) {
        createdFilter = `<=${until}`;
    }

    const config: ImportConfig = {integrationId, dryRun, concurrency, eventTypes, createdFilter, since, until};

    // ── Determine which repos to import ─────────────────────────────
    let repos: string[];

    if (singleRepo) {
        // Single repo mode (backwards compatible)
        repos = [singleRepo];
    } else {
        // Org discovery mode
        console.log(`\nDiscovering repositories in org: ${owner}`);
        const orgRepos = await fetchOrgRepos(owner);
        console.log(`  Found ${orgRepos.length} total repositories`);

        if (topicFilter) {
            const topics = topicFilter.split(',').map((t) => t.trim());
            const filtered = filterReposByTopics(orgRepos, topics);
            repos = filtered.map((r) => r.name);
            console.log(`  Filtered by topic(s) [${topics.join(', ')}]: ${repos.length} repositories`);
        } else {
            // Exclude archived/disabled repos even without topic filter
            repos = orgRepos.filter((r) => !r.archived && !r.disabled).map((r) => r.name);
            console.log(`  Active repositories: ${repos.length}`);
        }

        if (repos.length === 0) {
            console.log('\nNo repositories matched. Exiting.');
            return;
        }

        console.log(`\nRepositories to import:`);
        repos.forEach((r) => console.log(`  - ${owner}/${r}`));
    }

    console.log(`\nGitGazer Backfill Import`);
    console.log(`=======================`);
    console.log(`Organization:   ${owner}`);
    console.log(`Repositories:   ${repos.length}`);
    console.log(`Integration ID: ${integrationId}`);
    console.log(`Date filter:    ${createdFilter ?? 'none (all)'}`);
    console.log(`Concurrency:    ${concurrency} run(s) in parallel`);
    console.log(`Event types:    ${eventTypes.join(', ')}`);
    console.log(`Dry run:        ${dryRun}`);

    // ── Run import for each repo ────────────────────────────────────
    const allStats: Map<string, ImportStats> = new Map();
    const failedRepos: string[] = [];

    for (const repo of repos) {
        try {
            const stats = await importRepo(owner, repo, config);
            allStats.set(repo, stats);
        } catch (err) {
            console.error(`\nFATAL error importing ${owner}/${repo}: ${err}`);
            failedRepos.push(repo);
        }
    }

    // ── Summary ─────────────────────────────────────────────────────
    const needsWorkflowData = eventTypes.includes('workflow_run') || eventTypes.includes('workflow_job');
    const totals: ImportStats = {
        runSuccessCount: 0,
        runErrorCount: 0,
        jobSuccessCount: 0,
        jobErrorCount: 0,
        prSuccessCount: 0,
        prErrorCount: 0,
        reviewSuccessCount: 0,
        reviewErrorCount: 0,
    };

    for (const stats of allStats.values()) {
        totals.runSuccessCount += stats.runSuccessCount;
        totals.runErrorCount += stats.runErrorCount;
        totals.jobSuccessCount += stats.jobSuccessCount;
        totals.jobErrorCount += stats.jobErrorCount;
        totals.prSuccessCount += stats.prSuccessCount;
        totals.prErrorCount += stats.prErrorCount;
        totals.reviewSuccessCount += stats.reviewSuccessCount;
        totals.reviewErrorCount += stats.reviewErrorCount;
    }

    console.log(`\n=======================`);
    console.log(`Import complete!`);
    console.log(`  Repos: ${allStats.size} succeeded, ${failedRepos.length} failed`);
    if (needsWorkflowData) {
        console.log(`  Runs:  ${totals.runSuccessCount} succeeded, ${totals.runErrorCount} failed`);
        console.log(`  Jobs:  ${totals.jobSuccessCount} succeeded, ${totals.jobErrorCount} failed`);
    }
    if (eventTypes.includes('pull_request')) {
        console.log(`  PRs:   ${totals.prSuccessCount} succeeded, ${totals.prErrorCount} failed`);
    }
    if (eventTypes.includes('pull_request_review')) {
        console.log(`  Reviews: ${totals.reviewSuccessCount} succeeded, ${totals.reviewErrorCount} failed`);
    }
    if (failedRepos.length > 0) {
        console.log(`\nFailed repos:`);
        failedRepos.forEach((r) => console.log(`  - ${owner}/${r}`));
    }
};

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
