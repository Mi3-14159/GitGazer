import {RdsTransaction} from '@gitgazer/db/client';
import {workflowJobRelations} from '@gitgazer/db/queries';
import {workflowJobs} from '@gitgazer/db/schema';
import {WorkflowJobEvent, WorkflowJobWithRelations} from '@gitgazer/db/types';
import {and, eq} from 'drizzle-orm';
import {upsertWorkflowJobs} from './shared';

export const importWorkflowJob = async (
    tx: RdsTransaction,
    integrationId: string,
    event: WorkflowJobEvent,
): Promise<{
    workflowJob: WorkflowJobWithRelations;
    stale: boolean;
}> => {
    const {stale} = await upsertWorkflowJobs(tx, [
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
            senderId: event.sender.id,
            startedAt: new Date(event.workflow_job.started_at),
            status: event.workflow_job.status,
            workflowName: event.workflow_job.workflow_name!,
            workflowRunId: event.workflow_job.run_id,
        },
    ]);

    const workflowJob = await tx.query.workflowJobs.findFirst({
        where: and(eq(workflowJobs.integrationId, integrationId), eq(workflowJobs.id, event.workflow_job.id)),
        with: workflowJobRelations,
    });

    if (!workflowJob) {
        throw new Error(`Failed to load workflow job with relations for integration ${integrationId}, job id ${event.workflow_job.id}`);
    }

    return {workflowJob, stale};
};
