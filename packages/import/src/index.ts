import {insertEvent} from '@/controllers/imports/index';
import {fetchAllWorkflowRuns, fetchRepo, fetchWorkflowJobs} from './github';
import {transformWorkflowJob, transformWorkflowRun} from './transform';

const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
    return value;
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
    console.log(`Date filter:    ${createdFilter ?? 'none (all runs)'}`);
    console.log(`Concurrency:    ${concurrency} run(s) in parallel`);
    console.log(`Dry run:        ${dryRun}`);
    console.log();

    // Step 1: Fetch full repository info (used in all event payloads)
    console.log('Fetching repository info...');
    const fullRepo = await fetchRepo(owner, repo);
    console.log(`  Repository: ${fullRepo.full_name} (id: ${fullRepo.id})`);

    // Step 2: Fetch all workflow runs
    console.log('\nFetching workflow runs...');
    const runs = await fetchAllWorkflowRuns(owner, repo, createdFilter);
    console.log(`  Total runs: ${runs.length}`);

    let runSuccessCount = 0;
    let runErrorCount = 0;
    let jobSuccessCount = 0;
    let jobErrorCount = 0;

    // Helper function to process a single workflow run
    const processRun = async (run: any, index: number, total: number) => {
        const runLabel = `[${index + 1}/${total}] Run #${run.id} (${run.name})`;

        try {
            // Transform and insert workflow_run event
            // The run already contains workflow_id, name, and path — no need for a separate API call
            const workflowMeta = {id: run.workflow_id, name: run.name, path: run.path};
            const runEvent = transformWorkflowRun(run, fullRepo, workflowMeta);

            if (dryRun) {
                console.log(`${runLabel} - DRY RUN (workflow_run, action=${runEvent.action})`);
            } else {
                await insertEvent(integrationId, 'workflow_run', runEvent);
                console.log(`${runLabel} - inserted workflow_run`);
            }

            // Fetch and process jobs for this run
            const jobs = await fetchWorkflowJobs(owner, repo, run.id);
            const sender = run.triggering_actor ?? run.actor;

            // Process all jobs in parallel
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

            // Count job successes and failures
            const jobStats = {successCount: 0, errorCount: 0};
            jobResults.forEach((result, j) => {
                if (result.status === 'fulfilled') {
                    jobStats.successCount++;
                } else {
                    jobStats.errorCount++;
                    console.error(`  Job ${j + 1}/${jobs.length} #${jobs[j].id} (${jobs[j].name}) - ERROR: ${result.reason}`);
                }
            });

            return {runSuccess: true, ...jobStats};
        } catch (runError) {
            console.error(`${runLabel} - ERROR: ${runError}`);
            return {runSuccess: false, successCount: 0, errorCount: 0};
        }
    };

    // Step 3: Process workflow runs in batches
    for (let i = 0; i < runs.length; i += concurrency) {
        const batch = runs.slice(i, i + concurrency);
        console.log(`\nProcessing runs ${i + 1} to ${Math.min(i + batch.length, runs.length)}...`);
        const results = await Promise.allSettled(batch.map((run, batchIndex) => processRun(run, i + batchIndex, runs.length)));

        // Aggregate results
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

    // Summary
    console.log(`\n=======================`);
    console.log(`Import complete!`);
    console.log(`  Runs:  ${runSuccessCount} succeeded, ${runErrorCount} failed`);
    console.log(`  Jobs:  ${jobSuccessCount} succeeded, ${jobErrorCount} failed`);
};

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
