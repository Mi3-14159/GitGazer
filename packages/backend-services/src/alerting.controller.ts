import {findPullRequest, loadLogDetails} from './alerting/log-details';
import {buildSlackAlert, type SlackAlertInput, type SlackPayload} from './alerting/slack-payload';
import {computeVerdict} from './alerting/verdict';
import {createEventLogEntry} from './event-log.controller';
import {proxyFetch} from '@gitgazer/backend-core/clients/proxy-fetch';
import config from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {notificationRules} from '@gitgazer/db/schema';
import {NotificationRuleChannelType, WorkflowConclusion, WorkflowJobWithRelations} from '@gitgazer/db/types';
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

type AlertOptions = {getRemainingTimeMs?: () => number};

type DetailsSkipReason = 'rule_opt_out' | 'low_time';

export async function sendWorkflowJobAlerts(workflowJob: WorkflowJobWithRelations, options?: AlertOptions): Promise<void> {
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

    logger.info(`Found ${matching.length} matching notification rules for integration ${workflowJob.integrationId}`, {
        ruleIds: matching.map((rule) => rule.id),
    });

    const [verdict, pullRequest] = await Promise.all([computeVerdict(workflowJob), findPullRequest(workflowJob)]);

    const skipReason = getDetailsSkipReason(matching, options);
    const details = skipReason ? null : await loadLogDetails(workflowJob, verdict, pullRequest?.title ?? null);

    logger.info('Sending failure alert', {
        integrationId: workflowJob.integrationId,
        jobId: workflowJob.id,
        verdict: verdict.kind,
        detailsAttempted: skipReason === null,
        detailsLoaded: details !== null,
        summaryIncluded: Boolean(details?.summary),
        excerptIncluded: Boolean(details?.excerpt),
        skipReason: skipReason ?? undefined,
    });

    const alertInput: Omit<SlackAlertInput, 'details'> = {
        owner: context.ownerLogin,
        repository: context.repositoryName,
        branch: context.headBranch,
        workflowName: context.workflowName,
        jobName: context.jobName,
        jobId: workflowJob.id,
        runId: context.runId,
        runAttempt: workflowJob.runAttempt,
        event: workflowJob.workflowRun?.event ?? null,
        senderLogin: context.senderLogin,
        pullRequestNumber: pullRequest?.number ?? null,
        verdict,
    };

    for (const rule of matching) {
        const body = buildSlackAlert({...alertInput, details: rule.include_log_details ? details : null});
        for (const webhookUrl of getSlackWebhookUrls(rule)) {
            await sendSlackNotification(webhookUrl, body, rule.id, logger);
        }
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
                verdict: verdict.kind,
                // Counted by the daily summary cap, so only true when a summary was actually produced.
                aiSummary: Boolean(details?.summary),
            },
        });
    } catch (error) {
        logger.error('Failed to create event log entry', error as Error);
    }
}

function isCompletedFailure(workflowJob: WorkflowJobWithRelations): boolean {
    return workflowJob.status === 'completed' && workflowJob.conclusion === ('failure' satisfies WorkflowConclusion);
}

function getDetailsSkipReason(rules: MatchingRule[], options?: AlertOptions): DetailsSkipReason | null {
    if (!rules.some((rule) => rule.include_log_details)) return 'rule_opt_out';
    const remainingMs = options?.getRemainingTimeMs?.() ?? Infinity;
    return remainingMs < config.get('alerts').minRemainingMsForEnrichment ? 'low_time' : null;
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

function getSlackWebhookUrls(rule: MatchingRule): string[] {
    return rule.channels.filter((channel) => channel.type === NotificationRuleChannelType.SLACK).map((channel) => channel.webhook_url);
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
