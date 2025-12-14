import {getJobsBy, getNotificationRulesBy} from '@/clients/dynamodb';
import {resetLogger, set} from '@/logger';
import {fetchWithRetry} from '@/utils/fetch';
import {unmarshall} from '@aws-sdk/util-dynamodb';
import {Job, JobType, NotificationRule, NotificationRuleChannelType} from '@common/types';
import {WorkflowJobEvent, WorkflowRunEvent} from '@octokit/webhooks-types';
import {DynamoDBBatchResponse, DynamoDBStreamHandler} from 'aws-lambda';

export const handler: DynamoDBStreamHandler = async (event, context) => {
    const result: DynamoDBBatchResponse = {
        batchItemFailures: [],
    };

    const logger = set('requestId', context.awsRequestId);
    logger.debug({message: 'handle event', event});

    // Process the event
    for (const record of event.Records) {
        try {
            if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') {
                continue;
            }

            if (!record.dynamodb?.NewImage) {
                continue;
            }

            if (record.dynamodb?.NewImage?.event_type?.S !== JobType.WORKFLOW_JOB) {
                continue;
            }

            const item = unmarshall(record.dynamodb.NewImage as unknown as Record<string, any>) as Job<WorkflowJobEvent>;

            // Only alert for completed failures
            const {status} = item.workflow_event.workflow_job;
            const {conclusion} = item.workflow_event.workflow_job;
            if (status !== 'completed' || conclusion !== 'failure') {
                continue;
            }

            const integrationId = item.integrationId;
            const rules: NotificationRule[] = await getNotificationRulesBy({integrationIds: [integrationId]});
            logger.info({message: `Found ${rules.length} notification rules for integration ${integrationId}`, rules});

            const {full_name} = item.workflow_event.repository;
            const [owner, repository_name] = full_name.split('/');
            const {head_branch, workflow_name, name: job_name, run_id} = item.workflow_event.workflow_job;
            const sender = item.workflow_event.sender.login;
            const matching = rules.filter((r) => {
                if (!r.enabled) return false;
                if (!r.rule) return false;

                const {rule} = r;

                // Check dependabot filtering - matches Step Functions logic
                if (r.ignore_dependabot) {
                    const isDependabotUser = sender === 'dependabot[bot]';
                    const isDependabotWorkflow = job_name === 'Dependabot';
                    if (isDependabotUser || isDependabotWorkflow) {
                        return false;
                    }
                }

                // Match rules - empty string, star, or exact match (matches Step Functions FilterExpression)
                return (
                    (rule.owner === '' || rule.owner === '*' || rule.owner === owner) &&
                    (rule.repository_name === '' || rule.repository_name === '*' || rule.repository_name === repository_name) &&
                    (rule.workflow_name === '' || rule.workflow_name === '*' || rule.workflow_name === workflow_name) &&
                    (rule.head_branch === '' || rule.head_branch === '*' || rule.head_branch === head_branch)
                );
            });

            if (matching.length === 0) {
                logger.info({message: `No matching notification rules for integration ${integrationId}`});
                continue;
            }

            // Fetch parent workflow_run to get event field (matches Step Functions branch 2)
            let workflowRunEvent = '';
            const workflowRuns = await getJobsBy({
                keys: [{integrationId, id: run_id.toString()}],
                filters: {event_type: JobType.WORKFLOW_RUN},
                limit: 1,
            });
            const parentRun = workflowRuns.find(
                (job: Job<Partial<WorkflowJobEvent>>) => job.event_type === JobType.WORKFLOW_RUN && job.id === run_id.toString(),
            );
            if (parentRun && 'workflow_run' in parentRun.workflow_event) {
                workflowRunEvent = (parentRun.workflow_event as WorkflowRunEvent).workflow_run.event || '';
            }

            const body = {
                blocks: [
                    {
                        text: {
                            emoji: true,
                            text: `${item.workflow_event.workflow_job.workflow_name} - ${item.workflow_event.workflow_job.conclusion}`,
                            type: 'plain_text',
                        },
                        type: 'header',
                    },
                    {
                        fields: [
                            {
                                text: `*Organisation:* <http://github.com/${item.workflow_event.repository.owner.login}|${item.workflow_event.repository.owner.login}>`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Repository:* <${item.workflow_event.repository.html_url}|${item.workflow_event.repository.name}>`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Workflow:* <${item.workflow_event.repository.html_url}/actions/runs/${item.workflow_event.workflow_job.run_id}|${item.workflow_event.workflow_job.workflow_name} / ${item.workflow_event.workflow_job.name}>`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Conclusion:* <${item.workflow_event.repository.html_url}/actions/runs/${item.workflow_event.workflow_job.run_id}|${item.workflow_event.workflow_job.conclusion}>`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Event:* ${workflowRunEvent}`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Sender:* <https://github.com/${item.workflow_event.sender.login}|${item.workflow_event.sender.login}>`,
                                type: 'mrkdwn',
                            },
                        ],
                        type: 'section',
                    },
                ],
                color: '#e01e5a',
            };

            for (const rule of matching) {
                for (const channel of rule.channels) {
                    if (channel.type === NotificationRuleChannelType.SLACK) {
                        const res = await fetchWithRetry(channel.webhook_url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(body),
                            retries: 3,
                        });
                        if (!res.ok) {
                            throw new Error(`Slack webhook failed with status ${res.status} and body ${await res.text()}`);
                        }
                    }
                }
            }
        } catch (err) {
            logger.error({message: 'Record processing failed', error: err});
            if (record.eventID) {
                result.batchItemFailures.push({itemIdentifier: record.eventID});
            }
        }
    }

    logger.debug({message: 'result', result});

    logger.flush();
    resetLogger();
    return result;
};
