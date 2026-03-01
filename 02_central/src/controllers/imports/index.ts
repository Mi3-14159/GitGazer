import {db} from '@/clients/rds';
import {enterprises, events, gitgazerUser, organizations, repositories, user, workflowJobs, workflowRuns} from '@/drizzle/schema';
import {EventPayloadMap} from '@octokit/webhooks-types';
import {sql} from 'drizzle-orm';

export const insertEvent = async <T extends keyof EventPayloadMap>(integrationId: string, event: EventPayloadMap[T]) => {
    await db.transaction(async (tx) => {
        await tx.execute(sql`SET ROLE ${sql.identifier(gitgazerUser.name)};`);
        await tx.execute(sql`SET LOCAL rls.integration_ids = ${sql.identifier(integrationId)};`);

        // Insert the raw event
        await tx.insert(events).values({
            integrationId,
            event: event,
        });

        // Insert/Update Enterprise (if present)
        let enterpriseId: number | null = null;
        if ('enterprise' in event && event.enterprise) {
            const enterprise = event.enterprise as any;
            enterpriseId = enterprise.id;
            await tx
                .insert(enterprises)
                .values({
                    integrationId,
                    id: enterpriseId,
                    name: enterprise.name,
                    createdAt: new Date(enterprise.created_at),
                })
                .onConflictDoNothing();
        }

        // Insert/Update Organization (if present)
        let organizationId: number | null = null;
        if ('organization' in event && event.organization) {
            organizationId = event.organization.id;
            await tx
                .insert(organizations)
                .values({
                    integrationId,
                    id: organizationId,
                    enterpriseId: enterpriseId,
                    login: event.organization.login,
                    description: event.organization.description ?? null,
                })
                .onConflictDoNothing();
        }

        // Insert/Update Repository
        if ('repository' in event && event.repository) {
            await tx
                .insert(repositories)
                .values({
                    integrationId,
                    id: event.repository.id,
                    organizationId: organizationId,
                    name: event.repository.name,
                    private: event.repository.private,
                    createdAt: new Date(event.repository.created_at),
                    updatedAt: new Date(event.repository.updated_at),
                })
                .onConflictDoNothing();
        }

        // Insert/Update Sender (User)
        if ('sender' in event && event.sender) {
            await tx
                .insert(user)
                .values({
                    integrationId,
                    id: event.sender.id,
                    login: event.sender.login,
                    type: event.sender.type,
                })
                .onConflictDoNothing();
        }

        // Insert/Update Workflow Job
        if ('workflow_job' in event && event.workflow_job) {
            const completedAt = event.workflow_job.completed_at ? new Date(event.workflow_job.completed_at) : null;
            const conclusion = event.workflow_job.conclusion;

            await tx
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
                        workflowRunId: event.workflow_job.run_id,
                    },
                });
        }

        // Insert/Update Workflow Run
        if ('workflow_run' in event && event.workflow_run && 'head_commit' in event.workflow_run) {
            await tx
                .insert(user)
                .values({
                    integrationId,
                    id: event.workflow_run.actor.id,
                    login: event.workflow_run.actor.login,
                    type: event.workflow_run.actor.type,
                })
                .onConflictDoNothing();

            await tx
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
                })
                .onConflictDoUpdate({
                    target: [workflowRuns.integrationId, workflowRuns.id],
                    set: {
                        updatedAt: new Date(event.workflow_run.updated_at),
                        runAttempt: event.workflow_run.run_attempt,
                        status: event.workflow_run.status,
                        conclusion: event.workflow_run.conclusion,
                        runStartedAt: new Date(event.workflow_run.run_started_at),
                    },
                });
        }
    });
};
