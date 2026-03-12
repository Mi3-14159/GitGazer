import {RdsTransaction} from '@gitgazer/db/client';
import {workflowRunPullRequests, workflowRuns} from '@gitgazer/db/schema/github/workflows';
import {WorkflowRunEvent} from '@gitgazer/db/types';
import {InferSelectModel} from 'drizzle-orm/table';

export const importWorkflowRun = async (
    integrationId: string,
    event: WorkflowRunEvent,
    tx: RdsTransaction,
): Promise<{
    workflowRun: InferSelectModel<typeof workflowRuns>;
}> => {
    const workflowRun = await tx
        .insert(workflowRuns)
        .values({
            integrationId,
            id: event.workflow_run.id,
            repositoryId: event.repository.id,
            createdAt: new Date(event.workflow_run.created_at),
            updatedAt: new Date(event.workflow_run.updated_at),
            name: event.workflow_run.name,
            headBranch: event.workflow_run.head_branch,
            runAttempt: event.workflow_run.run_attempt,
            status: event.workflow_run.status,
            conclusion: event.workflow_run.conclusion,
            workflowId: event.workflow_run.workflow_id,
            runStartedAt: new Date(event.workflow_run.run_started_at),
            headCommitAuthorName: event.workflow_run.head_commit.author.name,
            headCommitMessage: event.workflow_run.head_commit.message,
            actorId: event.workflow_run.actor.id,
            event: event.workflow_run.event,
        })
        .onConflictDoUpdate({
            target: [workflowRuns.integrationId, workflowRuns.id],
            set: {
                updatedAt: new Date(event.workflow_run.updated_at),
                runAttempt: event.workflow_run.run_attempt,
                status: event.workflow_run.status,
                conclusion: event.workflow_run.conclusion,
                runStartedAt: new Date(event.workflow_run.run_started_at),
                event: event.workflow_run.event,
            },
        })
        .returning();

    // Insert pull request associations if the workflow run is part of pull requests
    if (event.workflow_run.pull_requests && Array.isArray(event.workflow_run.pull_requests) && event.workflow_run.pull_requests.length > 0) {
        const pullRequestAssociations = event.workflow_run.pull_requests.map((pr: any) => ({
            integrationId,
            workflowRunId: event.workflow_run.id,
            pullRequestId: pr.id,
        }));

        await tx.insert(workflowRunPullRequests).values(pullRequestAssociations).onConflictDoNothing();
    }

    return {
        workflowRun: workflowRun[0],
    };
};
