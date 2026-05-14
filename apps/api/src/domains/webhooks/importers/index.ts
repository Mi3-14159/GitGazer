import {importPullRequestReview} from '@/domains/webhooks/importers/pull-request-review.importer';
import {importPullRequest} from '@/domains/webhooks/importers/pull-request.importer';
import {importWorkflowJob} from '@/domains/webhooks/importers/workflow-job.importer';
import {importWorkflowRun} from '@/domains/webhooks/importers/workflow-run.importer';
import {importWorkflow} from '@/domains/webhooks/importers/workflow.importer';
import {getLogger} from '@/shared/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {events, gitgazerWriter} from '@gitgazer/db/schema';
import {
    EventPayloadMap,
    PullRequest,
    PullRequestReview,
    PullRequestReviewEvent,
    WorkflowJobWithRelations,
    WorkflowRunWithRelations,
} from '@gitgazer/db/types';
import {EmitterWebhookEventName} from '@octokit/webhooks';
import {InferSelectModel} from 'drizzle-orm/table';

const logger = getLogger();

export type InsertEventResult = {
    data: InferSelectModel<typeof events> | WorkflowJobWithRelations | WorkflowRunWithRelations | PullRequest | PullRequestReview;
    stale: boolean;
};

export const insertEvent = async <T extends EmitterWebhookEventName & keyof EventPayloadMap>(
    integrationId: string,
    eventType: T,
    event: EventPayloadMap[T],
): Promise<InsertEventResult> => {
    logger.info(`Inserting event for integration ${integrationId}, event type ${eventType}`);
    const result = await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            // Store in backup table for replay/debugging
            const ev = await tx
                .insert(events)
                .values({
                    integrationId,
                    event: event,
                })
                .returning();

            switch (eventType) {
                case 'workflow_job': {
                    if (!('workflow_job' in event)) break;
                    const workflowJobEvent = event as EventPayloadMap['workflow_job'];
                    await importWorkflow(tx, integrationId, workflowJobEvent);
                    const {workflowJob, stale} = await importWorkflowJob(tx, integrationId, workflowJobEvent);

                    logger.info(`Inserted workflow job event for integration ${integrationId}, job id ${workflowJob.id}`, {stale});
                    return {data: workflowJob, stale};
                }
                case 'workflow_run': {
                    if (!('workflow_run' in event)) break;
                    const workflowRunEvent = event as EventPayloadMap['workflow_run'];
                    const {repository, organization, owner} = await importWorkflow(tx, integrationId, workflowRunEvent);
                    const {workflowRun, stale} = await importWorkflowRun(tx, integrationId, workflowRunEvent);

                    const response: WorkflowRunWithRelations = {
                        ...workflowRun,
                        workflowJobs: [],
                        repository: {
                            ...repository,
                            owner,
                            organization: organization ?? null,
                        },
                    };

                    logger.info(`Inserted workflow run event for integration ${integrationId}, run id ${workflowRun.id}`, {stale});
                    return {data: response, stale};
                }
                case 'pull_request': {
                    if (!('pull_request' in event)) break;
                    const pullRequestEvent = event as EventPayloadMap['pull_request'];
                    const {pullRequest} = await importPullRequest(integrationId, pullRequestEvent, tx);

                    logger.info(`Inserted pull request event for integration ${integrationId}, PR id ${pullRequest.id}`);
                    return {data: pullRequest, stale: false};
                }
                case 'pull_request_review': {
                    if (!('review' in event)) break;
                    const {pullRequestReview} = await importPullRequestReview(integrationId, event as PullRequestReviewEvent, tx);

                    logger.info(`Inserted pull request review event for integration ${integrationId}, review id ${pullRequestReview.id}`);
                    return {data: pullRequestReview, stale: false};
                }
            }

            logger.info(`Inserted generic event for integration ${integrationId}, event type ${eventType}`);
            return {data: ev[0], stale: false};
        },
    });

    return result;
};
