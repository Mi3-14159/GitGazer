import {getLogger} from '@/shared/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {events, gitgazerWriter} from '@gitgazer/db/schema';
import {EventPayloadMap, PullRequest, PullRequestReview, PullRequestReviewEvent, WorkflowJob, WorkflowRunWithRelations} from '@gitgazer/db/types';
import {EmitterWebhookEventName} from '@octokit/webhooks';
import {InferSelectModel} from 'drizzle-orm/table';
import {importPullRequestReview} from './pull-request-review.importer';
import {importPullRequest} from './pull-request.importer';
import {importWorkflowJob} from './workflow-job.importer';
import {importWorkflowRun} from './workflow-run.importer';
import {importWorkflow} from './workflow.importer';

const logger = getLogger();

export const insertEvent = async <T extends EmitterWebhookEventName & keyof EventPayloadMap>(
    integrationId: string,
    eventType: T,
    event: EventPayloadMap[T],
): Promise<InferSelectModel<typeof events> | WorkflowJob | WorkflowRunWithRelations | PullRequest | PullRequestReview> => {
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

            if (eventType === 'workflow_job' && 'workflow_job' in event) {
                await importWorkflow(integrationId, event as EventPayloadMap['workflow_job'], tx);
                const {workflowJob} = await importWorkflowJob(integrationId, event as EventPayloadMap['workflow_job'], tx);

                logger.info(`Inserted workflow job event for integration ${integrationId}, job id ${workflowJob.id}`);
                return workflowJob;
            } else if (eventType === 'workflow_run' && 'workflow_run' in event) {
                const {repository, organization, owner} = await importWorkflow(integrationId, event as EventPayloadMap['workflow_run'], tx);
                const {workflowRun} = await importWorkflowRun(integrationId, event as EventPayloadMap['workflow_run'], tx);

                const response: WorkflowRunWithRelations = {
                    ...workflowRun,
                    workflowJobs: [],
                    repository: {
                        ...repository,
                        owner,
                        organization,
                    },
                };

                logger.info(`Inserted workflow run event for integration ${integrationId}, run id ${workflowRun.id}`);
                return response;
            } else if (eventType === 'pull_request' && 'pull_request' in event) {
                const {pullRequest} = await importPullRequest(integrationId, event as EventPayloadMap['pull_request'], tx);

                logger.info(`Inserted pull request event for integration ${integrationId}, PR id ${pullRequest.id}`);
                return pullRequest;
            } else if (eventType === 'pull_request_review' && 'review' in event) {
                const {pullRequestReview} = await importPullRequestReview(integrationId, event as PullRequestReviewEvent, tx);

                logger.info(`Inserted pull request review event for integration ${integrationId}, review id ${pullRequestReview.id}`);
                return pullRequestReview;
            }

            logger.info(`Inserted generic event for integration ${integrationId}, event type ${eventType}`);
            return ev[0];
        },
    });

    return result;
};
