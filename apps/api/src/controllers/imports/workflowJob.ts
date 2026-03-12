import {RdsTransaction} from '@gitgazer/db/client';
import {workflowJobs} from '@gitgazer/db/schema/github/workflows';
import {WorkflowJobEvent} from '@gitgazer/db/types';
import {InferSelectModel} from 'drizzle-orm/table';

export const importWorkflowJob = async (
    integrationId: string,
    event: WorkflowJobEvent,
    tx: RdsTransaction,
): Promise<{
    workflowJob: InferSelectModel<typeof workflowJobs>;
}> => {
    const completedAt = event.workflow_job.completed_at ? new Date(event.workflow_job.completed_at) : null;
    const conclusion = event.workflow_job.conclusion;

    const workflowJob = await tx
        .insert(workflowJobs)
        .values({
            integrationId,
            id: event.workflow_job.id,
            repositoryId: event.repository.id,
            completedAt,
            conclusion,
            createdAt: new Date(event.workflow_job.created_at),
            headBranch: event.workflow_job.head_branch,
            name: event.workflow_job.name,
            runnerGroupName: event.workflow_job.runner_group_name,
            runAttempt: event.workflow_job.run_attempt,
            runId: event.workflow_job.run_id,
            startedAt: new Date(event.workflow_job.started_at),
            status: event.workflow_job.status,
            workflowName: event.workflow_job.workflow_name,
            workflowRunId: event.workflow_job.run_id,
        } as any)
        .onConflictDoUpdate({
            target: [workflowJobs.integrationId, workflowJobs.id],
            set: {
                completedAt,
                conclusion,
                status: event.workflow_job.status,
            },
        })
        .returning();

    return {workflowJob: workflowJob[0]};
};
