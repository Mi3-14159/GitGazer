import {createEventLogEntry} from '@/domains/event-log/event-log.controller';
import {proxyFetch} from '@/shared/clients/proxy-fetch';
import {getLogger} from '@/shared/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {notificationRules} from '@gitgazer/db/schema';
import {NotificationRuleChannelType, WorkflowJobWithRelations} from '@gitgazer/db/types';
import {and, eq, or, sql} from 'drizzle-orm';

type AlertContext = {
    ownerLogin: string;
    repositoryName: string;
    fullName: string;
    headBranch: string | null;
    workflowName: string;
    jobName: string;
    runId: number;
    senderLogin: string;
};

type SlackPayload = {
    blocks: Array<{
        type: 'header' | 'section';
        text?: {
            emoji?: boolean;
            text: string;
            type: 'plain_text' | 'mrkdwn';
        };
        fields?: Array<{
            text: string;
            type: 'mrkdwn';
        }>;
    }>;
    color: string;
};

export async function sendWorkflowJobAlerts(workflowJob: WorkflowJobWithRelations): Promise<void> {
    const logger = getLogger();

    if (!isCompletedFailure(workflowJob)) {
        logger.debug('Skipping alert: not a completed failure', {
            status: workflowJob.status,
            conclusion: workflowJob.conclusion,
        });
        return;
    }

    const context = getAlertContext(workflowJob);
    const matching = await findMatchingNotificationRules(workflowJob, context);

    if (matching.length === 0) {
        logger.info(`No matching notification rules for integration ${workflowJob.integrationId}`);
        return;
    }

    logger.info(`Found ${matching.length} matching notification rules for integration ${workflowJob.integrationId}`, {matching});

    const body = getSlackBody(workflowJob);

    const notifications = flattenSlackNotifications(matching);

    for (const notification of notifications) {
        await sendSlackNotification(notification.webhookUrl, body, notification.ruleId, logger);
    }

    try {
        await createEventLogEntry({
            integrationId: workflowJob.integrationId,
            category: 'notification',
            type: 'alert',
            title: `${context.workflowName} / ${context.jobName} failed`,
            message: `Job "${context.jobName}" in workflow "${context.workflowName}" failed on ${context.repositoryName}/${context.headBranch}`,
            metadata: {
                repositoryId: workflowJob.repositoryId,
                repository: context.fullName,
                branch: context.headBranch ?? undefined,
                actor: context.senderLogin,
                workflowName: context.workflowName,
                jobName: context.jobName,
                workflowRunId: context.runId,
                workflowJobId: workflowJob.id,
            },
        });
    } catch (error) {
        logger.error('Failed to create event log entry', error as Error);
    }
}

function isCompletedFailure(workflowJob: WorkflowJobWithRelations): boolean {
    return workflowJob.status === 'completed' && workflowJob.conclusion === 'failure';
}

function getAlertContext(workflowJob: WorkflowJobWithRelations): AlertContext {
    const ownerLogin = workflowJob.repository.owner?.login ?? '';
    const repositoryName = workflowJob.repository.name;

    return {
        ownerLogin,
        repositoryName,
        fullName: ownerLogin ? `${ownerLogin}/${repositoryName}` : repositoryName,
        headBranch: workflowJob.headBranch,
        workflowName: workflowJob.workflowName,
        jobName: workflowJob.name,
        runId: workflowJob.runId,
        senderLogin: workflowJob.sender?.login ?? 'unknown',
    };
}

async function findMatchingNotificationRules(workflowJob: WorkflowJobWithRelations, context: AlertContext) {
    const isDependabotEvent = context.senderLogin === 'dependabot[bot]' || context.jobName === 'Dependabot';
    const repoTopics = workflowJob.repository.topics ?? [];

    return await withRlsTransaction({
        integrationIds: [workflowJob.integrationId],
        callback: async (tx: RdsTransaction) => {
            const conditions = [
                eq(notificationRules.enabled, true),
                or(
                    sql`${notificationRules.rule}->>'owner' IS NULL`,
                    sql`${notificationRules.rule}->>'owner' = ''`,
                    sql`${notificationRules.rule}->>'owner' = ${context.ownerLogin}`,
                ),
                or(
                    sql`${notificationRules.rule}->>'repository_name' IS NULL`,
                    sql`${notificationRules.rule}->>'repository_name' = ''`,
                    sql`${notificationRules.rule}->>'repository_name' = ${context.repositoryName}`,
                ),
                or(
                    sql`${notificationRules.rule}->>'workflow_name' IS NULL`,
                    sql`${notificationRules.rule}->>'workflow_name' = ''`,
                    sql`${notificationRules.rule}->>'workflow_name' = ${context.workflowName}`,
                ),
                or(
                    sql`${notificationRules.rule}->>'head_branch' IS NULL`,
                    sql`${notificationRules.rule}->>'head_branch' = ''`,
                    sql`${notificationRules.rule}->>'head_branch' = ${context.headBranch}`,
                ),
            ];

            const topicFilterConditions = [
                sql`${notificationRules.rule}->'topics' IS NULL`,
                sql`jsonb_array_length(COALESCE(${notificationRules.rule}->'topics', '[]'::jsonb)) = 0`,
            ];

            if (repoTopics.length > 0) {
                topicFilterConditions.push(
                    sql`${notificationRules.rule}->'topics' ?| ARRAY[${sql.join(
                        repoTopics.map((topic) => sql`${topic}`),
                        sql`,`,
                    )}]`,
                );
            }

            conditions.push(or(...topicFilterConditions));

            if (isDependabotEvent) {
                conditions.push(eq(notificationRules.ignore_dependabot, false));
            }

            return await tx
                .select()
                .from(notificationRules)
                .where(and(...conditions));
        },
    });
}

type MatchingRule = Awaited<ReturnType<typeof findMatchingNotificationRules>>[number];

function flattenSlackNotifications(rules: MatchingRule[]): Array<{ruleId: string | undefined; webhookUrl: string}> {
    return rules.flatMap((rule) =>
        rule.channels
            .filter((channel) => channel.type === NotificationRuleChannelType.SLACK)
            .map((channel) => ({ruleId: rule.id, webhookUrl: channel.webhook_url})),
    );
}

async function sendSlackNotification(webhookUrl: string, body: SlackPayload, ruleId: string | undefined, logger: ReturnType<typeof getLogger>) {
    try {
        const res = await proxyFetch(webhookUrl, {
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

function getSlackBody(workflowJob: WorkflowJobWithRelations): SlackPayload {
    const ownerLogin = workflowJob.repository.owner?.login ?? 'unknown';
    const repositoryName = workflowJob.repository.name;
    const repositoryUrl = `https://github.com/${ownerLogin}/${repositoryName}`;
    const senderLogin = workflowJob.sender?.login ?? 'unknown';

    return {
        blocks: [
            {
                text: {
                    emoji: true,
                    text: `${workflowJob.workflowName} - ${workflowJob.conclusion}`,
                    type: 'plain_text',
                },
                type: 'header',
            },
            {
                fields: [
                    {
                        text: `*Organisation:* <http://github.com/${ownerLogin}|${ownerLogin}>`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Repository:* <${repositoryUrl}|${repositoryName}>`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Workflow:* <${repositoryUrl}/actions/runs/${workflowJob.runId}|${workflowJob.workflowName} / ${workflowJob.name}>`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Conclusion:* <${repositoryUrl}/actions/runs/${workflowJob.runId}|${workflowJob.conclusion}>`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Event:* ${workflowJob.workflowRun?.event ?? 'unknown'}`,
                        type: 'mrkdwn',
                    },
                    {
                        text: `*Sender:* <https://github.com/${senderLogin}|${senderLogin}>`,
                        type: 'mrkdwn',
                    },
                ],
                type: 'section',
            },
        ],
        color: '#e01e5a',
    };
}
