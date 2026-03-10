import {RdsTransaction} from '@gitgazer/db/client';
import {user, workflowJobs} from '@gitgazer/db/schema/github/workflows';
import {WorkflowJobEvent} from '@gitgazer/db/types';
import {inArray} from 'drizzle-orm';
import {InferSelectModel} from 'drizzle-orm/table';

export const importWorkflowJob = async (
    integrationId: string,
    event: WorkflowJobEvent,
    tx: RdsTransaction,
): Promise<{
    workflowJob: InferSelectModel<typeof workflowJobs>;
}> => {
    // Deduplicate users by id before bulk insert
    const userMap = new Map<number, InferSelectModel<typeof user>>();
    userMap.set(event.repository.owner.id, {
        integrationId,
        id: event.repository.owner.id,
        login: event.repository.owner.login,
        type: event.repository.owner.type,
    });
    userMap.set(event.sender.id, {
        integrationId,
        id: event.sender.id,
        login: event.sender.login,
        type: event.sender.type,
    });

    // Insert/Update Users in bulk
    const users = await tx.insert(user).values(Array.from(userMap.values())).onConflictDoNothing().returning();

    if (users.length < userMap.size) {
        // If some users were not inserted, it means they already exist. Fetch them to get their data.
        const existingUsers = await tx
            .select()
            .from(user)
            .where(inArray(user.id, Array.from(userMap.keys())));

        existingUsers.forEach((user) => {
            if (!userMap.has(user.id)) {
                userMap.set(user.id, user);
            }
        });
    }

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
