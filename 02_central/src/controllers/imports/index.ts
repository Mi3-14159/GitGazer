import {withRlsTransaction} from '@/clients/rds';
import {EventPayloadMap, WorkflowJob, WorkflowRun} from '@/common/types';
import {events} from '@/drizzle/schema';
import {getLogger} from '@/logger';
import {EmitterWebhookEventName} from '@octokit/webhooks';
import {InferSelectModel} from 'drizzle-orm/table';
import {importWorkflow} from './workflow';
import {importWorkflowJob} from './workflowJob';
import {importWorkflowRun} from './workflowRun';

const logger = getLogger();

export const insertEvent = async <T extends EmitterWebhookEventName & keyof EventPayloadMap>(
    integrationId: string,
    eventType: T,
    event: EventPayloadMap[T],
): Promise<WorkflowJob | WorkflowRun | InferSelectModel<typeof events>> => {
    const result = await withRlsTransaction([integrationId], async (tx) => {
        // Store in backup table for replay/debugging
        const ev = await tx
            .insert(events)
            .values({
                integrationId,
                event: event,
            })
            .returning();

        if (eventType === 'workflow_job' && 'workflow_job' in event) {
            await importWorkflow(integrationId, event as EventPayloadMap['workflow_job'], tx);
            const workflowJob = await importWorkflowJob(integrationId, event as EventPayloadMap['workflow_job'], tx);
            const response: WorkflowJob = {
                ...workflowJob,
                createdAt: workflowJob.createdAt.toString(),
                startedAt: workflowJob.startedAt.toString(),
                completedAt: workflowJob.completedAt?.toString(),
            };

            logger.info(`Inserted workflow job event for integration ${integrationId}, job id ${workflowJob.id}`);
            return response;
        } else if (eventType === 'workflow_run' && 'workflow_run' in event) {
            const {repository, organization} = await importWorkflow(integrationId, event as EventPayloadMap['workflow_run'], tx);
            const workflowRun = await importWorkflowRun(integrationId, event as EventPayloadMap['workflow_run'], tx);

            const response: WorkflowRun = {
                ...workflowRun,
                createdAt: workflowRun.createdAt.toString(),
                runStartedAt: workflowRun.runStartedAt.toString(),
                updatedAt: workflowRun.updatedAt.toString(),
                workflowJobs: [],
                repository: {
                    fullName: [organization?.login, repository.name].filter(Boolean).join('/'),
                },
            };

            logger.info(`Inserted workflow run event for integration ${integrationId}, run id ${workflowRun.id}`);
            return response;
        }

        logger.info(`Inserted generic event for integration ${integrationId}, event type ${eventType}`);
        return ev[0];
    });

    return result;
};
