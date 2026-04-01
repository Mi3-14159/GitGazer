import {createEventLogEntry} from '@/domains/event-log/event-log.controller';
import {fetchWithRetry} from '@/shared/helpers/fetch';
import {getLogger} from '@/shared/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {notificationRules, workflowRuns} from '@gitgazer/db/schema';
import {NotificationRuleChannelType, WorkflowJobEvent} from '@gitgazer/db/types';
import {and, eq, or, sql} from 'drizzle-orm';

export async function sendWorkflowJobAlerts(integrationId: string, event: WorkflowJobEvent): Promise<void> {
    const logger = getLogger();

    // Only alert for completed failures
    const {status} = event.workflow_job;
    const {conclusion} = event.workflow_job;
    if (status !== 'completed' || conclusion !== 'failure') {
        logger.debug('Skipping alert: not a completed failure', {status, conclusion});
        return;
    }

    const {full_name} = event.repository;
    const [owner, repository_name] = full_name.split('/');
    const {head_branch, workflow_name, name: job_name, run_id} = event.workflow_job;
    const sender = event.sender.login;

    // Check if this is a dependabot event
    const isDependabotEvent = sender === 'dependabot[bot]' || job_name === 'Dependabot';

    // Query notification rules with SQL filtering for owner/repo/workflow/branch matching and dependabot
    const matching = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            const conditions = [
                eq(notificationRules.enabled, true),
                or(
                    sql`${notificationRules.rule}->>'owner' IS NULL`,
                    sql`${notificationRules.rule}->>'owner' = ''`,
                    sql`${notificationRules.rule}->>'owner' = ${owner}`,
                ),
                or(
                    sql`${notificationRules.rule}->>'repository_name' IS NULL`,
                    sql`${notificationRules.rule}->>'repository_name' = ''`,
                    sql`${notificationRules.rule}->>'repository_name' = ${repository_name}`,
                ),
                or(
                    sql`${notificationRules.rule}->>'workflow_name' IS NULL`,
                    sql`${notificationRules.rule}->>'workflow_name' = ''`,
                    sql`${notificationRules.rule}->>'workflow_name' = ${workflow_name}`,
                ),
                or(
                    sql`${notificationRules.rule}->>'head_branch' IS NULL`,
                    sql`${notificationRules.rule}->>'head_branch' = ''`,
                    sql`${notificationRules.rule}->>'head_branch' = ${head_branch}`,
                ),
            ];

            const topicFilterConditions = [
                sql`${notificationRules.rule}->'topics' IS NULL`,
                sql`jsonb_array_length(COALESCE(${notificationRules.rule}->'topics', '[]'::jsonb)) = 0`,
            ];

            const repoTopics = event.repository.topics ?? [];
            if (repoTopics.length > 0) {
                topicFilterConditions.push(
                    sql`${notificationRules.rule}->'topics' ?| ARRAY[${sql.join(
                        repoTopics.map((t) => sql`${t}`),
                        sql`,`,
                    )}]`,
                );
            }

            conditions.push(or(...topicFilterConditions));

            // If this is a dependabot event, only include rules with ignore_dependabot = false
            if (isDependabotEvent) {
                conditions.push(eq(notificationRules.ignore_dependabot, false));
            }

            return await tx
                .select()
                .from(notificationRules)
                .where(and(...conditions));
        },
    });

    if (matching.length === 0) {
        logger.info(`No matching notification rules for integration ${integrationId}`);
        return;
    }

    logger.info(`Found ${matching.length} matching notification rules for integration ${integrationId}`, {matching});

    // Fetch parent workflow_run to get event field
    const workflowRunResult = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            return await tx
                .select({event: workflowRuns.event})
                .from(workflowRuns)
                .where(and(eq(workflowRuns.integrationId, integrationId), eq(workflowRuns.id, run_id)))
                .limit(1);
        },
    });

    const body = getSlackBody(event, workflowRunResult?.[0]);

    // Flatten rules and channels into a single array of notifications to send
    const notifications = matching.flatMap((rule) =>
        rule.channels
            .filter((channel) => channel.type === NotificationRuleChannelType.SLACK)
            .map((channel) => ({ruleId: rule.id, webhookUrl: channel.webhook_url})),
    );

    // Send all notifications
    for (const notification of notifications) {
        await sendSlackNotification(notification.webhookUrl, body, notification.ruleId, logger);
    }

    // Create event log entry for this alert
    try {
        await createEventLogEntry({
            integrationId,
            category: 'notification',
            type: 'alert',
            title: `${workflow_name} / ${job_name} failed`,
            message: `Job "${job_name}" in workflow "${workflow_name}" failed on ${repository_name}/${head_branch}`,
            metadata: {
                repositoryId: event.repository.id,
                repository: full_name,
                branch: head_branch ?? undefined,
                actor: sender,
                workflowName: workflow_name ?? undefined,
                jobName: job_name,
                workflowRunId: run_id,
                workflowJobId: event.workflow_job.id,
            },
        });
    } catch (error) {
        logger.error('Failed to create event log entry', error as Error);
    }
}

async function sendSlackNotification(webhookUrl: string, body: any, ruleId: string | undefined, logger: ReturnType<typeof getLogger>) {
    try {
        const res = await fetchWithRetry(webhookUrl, {
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
        logger.info(`Successfully sent alert to Slack for rule ${ruleId}`);
    } catch (error) {
        logger.error(`Failed to send Slack notification for rule ${ruleId}`, error as Error);
    }
}

const getSlackBody = (event: WorkflowJobEvent, workflowRunResult?: {event: string | null}) => {
    return {
        blocks: [
            {
                text: {
                    emoji: true,
                    text: `${event.workflow_job.workflow_name} - ${event.workflow_job.conclusion}`,
                    type: 'plain_text',
                },
                type: 'header',
            },
            {
                fields: [
                    {
                        text: `*Organisation:* <http://github.com/${event.repository.owner.login}|${event.repository.owner.login}>`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Repository:* <${event.repository.html_url}|${event.repository.name}>`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Workflow:* <${event.repository.html_url}/actions/runs/${event.workflow_job.run_id}|${event.workflow_job.workflow_name} / ${event.workflow_job.name}>`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Conclusion:* <${event.repository.html_url}/actions/runs/${event.workflow_job.run_id}|${event.workflow_job.conclusion}>`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Event:* ${workflowRunResult?.event}`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Sender:* <https://github.com/${event.sender.login}|${event.sender.login}>`,
                        type: 'mrkdwn',
                    },
                ],
                type: 'section',
            },
        ],
        color: '#e01e5a',
    };
};
