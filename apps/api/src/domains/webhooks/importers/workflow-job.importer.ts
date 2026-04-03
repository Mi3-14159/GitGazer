import {RdsTransaction} from '@gitgazer/db/client';
import {WorkflowJob, WorkflowJobEvent} from '@gitgazer/db/types';
import {upsertWorkflowJobs} from './shared';

export const importWorkflowJob = async (
    tx: RdsTransaction,
    integrationId: string,
    event: WorkflowJobEvent,
): Promise<{
    workflowJob: WorkflowJob;
    stale: boolean;
}> => {
    const {workflowJobs, stale} = await upsertWorkflowJobs(tx, [
        {
            integrationId,
            repositoryId: event.repository.id,
            id: event.workflow_job.id,
            completedAt: event.workflow_job.completed_at ? new Date(event.workflow_job.completed_at) : null,
            conclusion: event.workflow_job.conclusion ?? null,
            createdAt: new Date(event.workflow_job.created_at),
            headBranch: event.workflow_job.head_branch,
            name: event.workflow_job.name,
            runnerGroupName: event.workflow_job.runner_group_name,
            runAttempt: event.workflow_job.run_attempt,
            runId: event.workflow_job.run_id,
            startedAt: new Date(event.workflow_job.started_at),
            status: event.workflow_job.status,
            workflowName: event.workflow_job.name,
            workflowRunId: event.workflow_job.run_id,
        },
    ]);

    return {workflowJob: workflowJobs[0], stale};
};
