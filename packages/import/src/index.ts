import {insertEvent} from '@/controllers/imports/index';
import {fetchAllWorkflowRuns, fetchRepo, fetchWorkflow, fetchWorkflowJobs} from './github';
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

    // Cache workflow metadata to avoid redundant API calls
    const workflowCache = new Map<number, any>();

    let runSuccessCount = 0;
    let runErrorCount = 0;
    let jobSuccessCount = 0;
    let jobErrorCount = 0;

    // Step 3: Process each workflow run
    for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        const runLabel = `[${i + 1}/${runs.length}] Run #${run.id} (${run.name})`;

        try {
            // Fetch workflow metadata (cached)
            let workflowMeta = workflowCache.get(run.workflow_id);
            if (!workflowMeta) {
                workflowMeta = await fetchWorkflow(owner, repo, run.workflow_id);
                workflowCache.set(run.workflow_id, workflowMeta);
            }

            // Transform and insert workflow_run event
            const runEvent = transformWorkflowRun(run, fullRepo, workflowMeta);

            if (dryRun) {
                console.log(`${runLabel} - DRY RUN (workflow_run, action=${runEvent.action})`);
            } else {
                await insertEvent(integrationId, 'workflow_run', runEvent);
                console.log(`${runLabel} - inserted workflow_run`);
            }
            runSuccessCount++;

            // Fetch and process jobs for this run
            const jobs = await fetchWorkflowJobs(owner, repo, run.id);
            const sender = run.triggering_actor ?? run.actor;

            for (let j = 0; j < jobs.length; j++) {
                const job = jobs[j];
                try {
                    const jobEvent = transformWorkflowJob(job, fullRepo, sender);

                    if (dryRun) {
                        console.log(`  Job ${j + 1}/${jobs.length} #${job.id} (${job.name}) - DRY RUN`);
                    } else {
                        await insertEvent(integrationId, 'workflow_job', jobEvent);
                        console.log(`  Job ${j + 1}/${jobs.length} #${job.id} (${job.name}) - inserted`);
                    }
                    jobSuccessCount++;
                } catch (jobError) {
                    jobErrorCount++;
                    console.error(`  Job ${j + 1}/${jobs.length} #${job.id} (${job.name}) - ERROR: ${jobError}`);
                }
            }
        } catch (runError) {
            runErrorCount++;
            console.error(`${runLabel} - ERROR: ${runError}`);
        }
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
