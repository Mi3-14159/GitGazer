import {withRlsTransaction} from '@/clients/rds';
import {Event, NotificationRuleChannelType, WorkflowJobEvent} from '@/common/types';
import {notificationRules, workflowRuns} from '@/drizzle/schema';
import {getLogger} from '@/logger';
import {fetchWithRetry} from '@/utils/fetch';
import {unmarshall} from '@aws-sdk/util-dynamodb';
import {DynamoDBBatchResponse, DynamoDBStreamHandler} from 'aws-lambda';
import {and, eq, or, sql} from 'drizzle-orm';

const logger = getLogger();

export const handler: DynamoDBStreamHandler = async (event, context) => {
    logger.resetKeys();
    logger.addContext(context);
    logger.logEventIfEnabled(event);

    const result: DynamoDBBatchResponse = {
        batchItemFailures: [],
    };

    // Process the event
    for (const record of event.Records) {
        try {
            if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') {
                continue;
            }

            if (!record.dynamodb?.NewImage) {
                continue;
            }

            if (record.dynamodb?.NewImage?.event_type?.S !== 'workflow_job') {
                continue;
            }

            const item = unmarshall(record.dynamodb.NewImage as unknown as Record<string, any>) as Event<WorkflowJobEvent>;

            // Only alert for completed failures
            const {status} = item.event.workflow_job;
            const {conclusion} = item.event.workflow_job;
            if (status !== 'completed' || conclusion !== 'failure') {
                continue;
            }

            const integrationId = item.integrationId;

            const {full_name} = item.event.repository;
            const [owner, repository_name] = full_name.split('/');
            const {head_branch, workflow_name, name: job_name, run_id} = item.event.workflow_job;
            const sender = item.event.sender.login;

            // Check if this is a dependabot event
            const isDependabotEvent = sender === 'dependabot[bot]' || job_name === 'Dependabot';

            // Query notification rules with SQL filtering for owner/repo/workflow/branch matching and dependabot
            const matching = await withRlsTransaction([integrationId], async (tx) => {
                const conditions = [
                    eq(notificationRules.enabled, true),
                    or(
                        sql`${notificationRules.rule}->>'owner' = ''`,
                        sql`${notificationRules.rule}->>'owner' = '*'`,
                        sql`${notificationRules.rule}->>'owner' = ${owner}`,
                    ),
                    or(
                        sql`${notificationRules.rule}->>'repository_name' = ''`,
                        sql`${notificationRules.rule}->>'repository_name' = '*'`,
                        sql`${notificationRules.rule}->>'repository_name' = ${repository_name}`,
                    ),
                    or(
                        sql`${notificationRules.rule}->>'workflow_name' = ''`,
                        sql`${notificationRules.rule}->>'workflow_name' = '*'`,
                        sql`${notificationRules.rule}->>'workflow_name' = ${workflow_name}`,
                    ),
                    or(
                        sql`${notificationRules.rule}->>'head_branch' = ''`,
                        sql`${notificationRules.rule}->>'head_branch' = '*'`,
                        sql`${notificationRules.rule}->>'head_branch' = ${head_branch}`,
                    ),
                ];

                // If this is a dependabot event, only include rules with ignore_dependabot = false
                if (isDependabotEvent) {
                    conditions.push(eq(notificationRules.ignore_dependabot, false));
                }

                return await tx
                    .select()
                    .from(notificationRules)
                    .where(and(...conditions));
            });

            logger.info(`Found ${matching.length} matching notification rules for integration ${integrationId}`, {matching});

            if (matching.length === 0) {
                logger.info(`No matching notification rules for integration ${integrationId}`);
                continue;
            }

            // Fetch parent workflow_run to get event field
            const workflowRunResult = await withRlsTransaction([integrationId], async (tx) => {
                return await tx
                    .select({event: workflowRuns.event})
                    .from(workflowRuns)
                    .where(and(eq(workflowRuns.integrationId, integrationId), eq(workflowRuns.id, run_id)))
                    .limit(1);
            });

            const body = {
                blocks: [
                    {
                        text: {
                            emoji: true,
                            text: `${item.event.workflow_job.workflow_name} - ${item.event.workflow_job.conclusion}`,
                            type: 'plain_text',
                        },
                        type: 'header',
                    },
                    {
                        fields: [
                            {
                                text: `*Organisation:* <http://github.com/${item.event.repository.owner.login}|${item.event.repository.owner.login}>`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Repository:* <${item.event.repository.html_url}|${item.event.repository.name}>`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Workflow:* <${item.event.repository.html_url}/actions/runs/${item.event.workflow_job.run_id}|${item.event.workflow_job.workflow_name} / ${item.event.workflow_job.name}>`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Conclusion:* <${item.event.repository.html_url}/actions/runs/${item.event.workflow_job.run_id}|${item.event.workflow_job.conclusion}>`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Event:* ${workflowRunResult[0]?.event}`,
                                type: 'mrkdwn',
                            },
                            {
                                text: `*Sender:* <https://github.com/${item.event.sender.login}|${item.event.sender.login}>`,
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
        } catch (error) {
            logger.error('Record processing failed', error as Error);
            if (record.eventID) {
                result.batchItemFailures.push({itemIdentifier: record.eventID});
            }
        }
    }

    logger.debug('result', {result});
    return result;
};
