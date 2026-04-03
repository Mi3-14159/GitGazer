import {upsertWorkflowRunPullRequestAssociations, upsertWorkflowRuns} from '@/domains/webhooks/importers/shared';
import {RdsTransaction} from '@gitgazer/db/client';
import {WorkflowRun, WorkflowRunEvent} from '@gitgazer/db/types';

export const importWorkflowRun = async (
    tx: RdsTransaction,
    integrationId: string,
    event: WorkflowRunEvent,
): Promise<{
    workflowRun: WorkflowRun;
    stale: boolean;
}> => {
    const {workflowRuns, stale} = await upsertWorkflowRuns(tx, [
        {
            integrationId,
            repositoryId: event.repository.id,
            id: event.workflow_run.id,
            actorId: event.workflow_run.actor.id,
            event: event.workflow_run.event,
            conclusion: event.workflow_run.conclusion,
            createdAt: new Date(event.workflow_run.created_at),
            headBranch: event.workflow_run.head_branch,
            name: event.workflow_run.name,
            runAttempt: event.workflow_run.run_attempt,
            status: event.workflow_run.status,
            runStartedAt: new Date(event.workflow_run.run_started_at),
            updatedAt: new Date(event.workflow_run.updated_at),
            workflowId: event.workflow_run.workflow_id,
            headCommitAuthorName: event.workflow_run.head_commit.author.name,
            headCommitMessage: event.workflow_run.head_commit.message,
        },
    ]);

    // Insert pull request associations if the workflow run is part of pull requests
    if (event.workflow_run.pull_requests && Array.isArray(event.workflow_run.pull_requests) && event.workflow_run.pull_requests.length > 0) {
        const pullRequestAssociations = event.workflow_run.pull_requests.map((pr: any) => ({
            integrationId,
            workflowRunId: event.workflow_run.id,
            pullRequestId: pr.id,
        }));

        await upsertWorkflowRunPullRequestAssociations(tx, pullRequestAssociations);
    }

    return {workflowRun: workflowRuns[0], stale};
};
