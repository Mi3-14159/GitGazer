import {insertEvent} from '@/controllers/imports/index';
import {fetchAllPullRequests, fetchAllWorkflowRuns, fetchRepo, fetchWorkflowJobs} from './github';
import {transformPullRequest, transformWorkflowJob, transformWorkflowRun} from './transform';

const SUPPORTED_EVENT_TYPES = ['workflow_run', 'workflow_job', 'pull_request'] as const;
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

const main = async () => {
    const owner = required('GITHUB_OWNER');
    const repo = required('GITHUB_REPO');
    const integrationId = required('INTEGRATION_ID');
    required('GITHUB_TOKEN');

    // Optional date range filters
    const since = process.env.SINCE; // e.g. "2025-01-01"
    const until = process.env.UNTIL; // e.g. "2025-12-31"

    const dryRun = process.env.DRY_RUN === 'true';
    const concurrency = parseInt(process.env.CONCURRENCY || '1', 10);
    const eventTypes = parseEventTypes(process.env.EVENT_TYPES);

    // Build the `created` filter for the GitHub API
    // Format: ">=2025-01-01..<=2025-12-31" or ">=2025-01-01" or "<=2025-12-31"
    let createdFilter: string | undefined;
    if (since && until) {
        createdFilter = `${since}..${until}`;
    } else if (since) {
        createdFilter = `>=${since}`;
    } else if (until) {
        createdFilter = `<=${until}`;
    }

    console.log(`\nGitGazer Backfill Import`);
    console.log(`=======================`);
    console.log(`Repository:     ${owner}/${repo}`);
    console.log(`Integration ID: ${integrationId}`);
    console.log(`Date filter:    ${createdFilter ?? 'none (all)'}`);
    console.log(`Concurrency:    ${concurrency} run(s) in parallel`);
    console.log(`Event types:    ${eventTypes.join(', ')}`);
    console.log(`Dry run:        ${dryRun}`);
    console.log();

    // Step 1: Fetch full repository info (used in all event payloads)
    console.log('Fetching repository info...');
    const fullRepo = await fetchRepo(owner, repo);
    console.log(`  Repository: ${fullRepo.full_name} (id: ${fullRepo.id})`);

    const needsWorkflowData = eventTypes.includes('workflow_run') || eventTypes.includes('workflow_job');

    let runSuccessCount = 0;
    let runErrorCount = 0;
    let jobSuccessCount = 0;
    let jobErrorCount = 0;
    let prSuccessCount = 0;
    let prErrorCount = 0;

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
                    if (runSuccess) runSuccessCount++;
                    else runErrorCount++;
                    jobSuccessCount += successCount;
                    jobErrorCount += errorCount;
                } else {
                    runErrorCount++;
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

                    const prEvent = transformPullRequest(pr, fullRepo);

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
                    prSuccessCount++;
                } else {
                    prErrorCount++;
                    const pr = batch[j];
                    console.error(`  PR #${pr.number} (${pr.title}) - ERROR: ${result.reason}`);
                }
            });
        }
    }

    // Summary
    console.log(`\n=======================`);
    console.log(`Import complete!`);
    if (needsWorkflowData) {
        console.log(`  Runs:  ${runSuccessCount} succeeded, ${runErrorCount} failed`);
        console.log(`  Jobs:  ${jobSuccessCount} succeeded, ${jobErrorCount} failed`);
    }
    if (eventTypes.includes('pull_request')) {
        console.log(`  PRs:   ${prSuccessCount} succeeded, ${prErrorCount} failed`);
    }
};

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
