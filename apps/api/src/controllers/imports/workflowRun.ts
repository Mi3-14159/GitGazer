import {RdsTransaction} from '@gitgazer/db/client';
import {user, workflowRuns} from '@gitgazer/db/schema/github/workflows';
import {WorkflowRunEvent} from '@gitgazer/db/types';
import {inArray} from 'drizzle-orm';
import {InferSelectModel} from 'drizzle-orm/table';

export const importWorkflowRun = async (
    integrationId: string,
    event: WorkflowRunEvent,
    tx: RdsTransaction,
): Promise<{
    workflowRun: InferSelectModel<typeof workflowRuns>;
    owner: InferSelectModel<typeof user>;
    actor: InferSelectModel<typeof user>;
    sender: InferSelectModel<typeof user>;
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
    userMap.set(event.workflow_run.actor.id, {
        integrationId,
        id: event.workflow_run.actor.id,
        login: event.workflow_run.actor.login,
        type: event.workflow_run.actor.type,
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

    return {
        workflowRun: workflowRun[0],
        owner: users.find((u) => u.id === event.repository.owner.id)!,
        sender: users.find((u) => u.id === event.sender.id)!,
        actor: users.find((u) => u.id === event.workflow_run.actor.id)!,
    };
};
