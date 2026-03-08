import {withRlsTransaction} from '@gitgazer/db/client';
import {NotificationRuleChannelType, WorkflowJobEvent} from '@gitgazer/db/types';
import {notificationRules, workflowRuns} from '@gitgazer/db/schema';
import {getLogger} from '@/logger';
import {fetchWithRetry} from '@/utils/fetch';
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

    if (matching.length === 0) {
        logger.info(`No matching notification rules for integration ${integrationId}`);
        return;
    }

    logger.info(`Found ${matching.length} matching notification rules for integration ${integrationId}`, {matching});

    // Fetch parent workflow_run to get event field
    const workflowRunResult = await withRlsTransaction([integrationId], async (tx) => {
        return await tx
            .select({event: workflowRuns.event})
            .from(workflowRuns)
            .where(and(eq(workflowRuns.integrationId, integrationId), eq(workflowRuns.id, run_id)))
            .limit(1);
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
