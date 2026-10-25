import {findPullRequest, loadLogDetails, type DetailsSkipReason, type LogDetails} from './alerting/log-details';
import {buildSlackAlert, type SlackAlertInput, type SlackPayload} from './alerting/slack-payload';
import {computeVerdict} from './alerting/verdict';
import {createEventLogEntry} from './event-log.controller';
import {proxyFetch} from '@gitgazer/backend-core/clients/proxy-fetch';
import config from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {notificationRuleDestinations, notificationRules, webhookHandleDetails} from '@gitgazer/db/schema';
import {WorkflowConclusion, WorkflowJobWithRelations} from '@gitgazer/db/types';
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

export async function sendWorkflowJobAlerts(workflowJob: WorkflowJobWithRelations, options?: AlertOptions): Promise<void> {
    const logger = getLogger();
    // Passed on every line: alerts run while the worker ingests other records, so shared logger keys would name the wrong job.
    const logIds = {integrationId: workflowJob.integrationId, jobId: workflowJob.id};

    if (!isCompletedFailure(workflowJob)) {
        logger.debug('Skipping alert: not a completed failure', {
            ...logIds,
            status: workflowJob.status,
            conclusion: workflowJob.conclusion,
        });
        return;
    }

    const context = getAlertContext(workflowJob);
    const {ruleIds, targets} = await findMatchingRulesAndTargets(workflowJob, context);

    if (ruleIds.length === 0) {
        logger.info(`No matching notification rules for integration ${workflowJob.integrationId}`, logIds);
        return;
    }

    logger.info(`Found ${ruleIds.length} matching notification rules for integration ${workflowJob.integrationId}`, {
        ...logIds,
        ruleIds,
    });

    const [verdict, pullRequest] = await Promise.all([computeVerdict(workflowJob), findPullRequest(workflowJob)]);

    let details: LogDetails | null = null;
    if (targets.length === 0) {
        logger.warn('Matching notification rules have no destinations', logIds);
    } else {
        const skipReason = getDetailsSkipReason(targets, options);
        details = skipReason ? null : await loadLogDetails(workflowJob, verdict, pullRequest?.title ?? null);

        logger.info('Sending failure alert', {
            ...logIds,
            verdict: verdict.kind,
            handleCount: targets.length,
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

        for (const target of targets) {
            const body = buildSlackAlert({...alertInput, details: target.includeLogDetails ? details : null});
            await sendSlackNotification(target.url, body, {...logIds, handleId: target.handleId}, logger);
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
        logger.error('Failed to create event log entry', {...logIds, error});
    }
}

function isCompletedFailure(workflowJob: WorkflowJobWithRelations): boolean {
    return workflowJob.status === 'completed' && workflowJob.conclusion === ('failure' satisfies WorkflowConclusion);
}

function getDetailsSkipReason(targets: HandleTarget[], options?: AlertOptions): DetailsSkipReason | null {
    if (!targets.some((target) => target.includeLogDetails)) return 'rule_opt_out';
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

type HandleTarget = {handleId: string; url: string; includeLogDetails: boolean};

// Rules and their handles come from one statement so a concurrent rule edit cannot pair old filters or log settings with a new destination.
async function findMatchingRulesAndTargets(
    workflowJob: WorkflowJobWithRelations,
    context: AlertContext,
): Promise<{ruleIds: string[]; targets: HandleTarget[]}> {
    const isDependabotEvent = context.senderLogin === 'dependabot[bot]' || context.jobName === 'Dependabot';
    const repoTopics = workflowJob.repository.topics ?? [];

    const rows = await withRlsTransaction({
        integrationIds: [workflowJob.integrationId],
        callback: async (tx: RdsTransaction) => {
            const conditions = [
                eq(notificationRules.integrationId, workflowJob.integrationId),
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
                .select({
                    ruleId: notificationRules.id,
                    includeLogDetails: notificationRules.include_log_details,
                    handleId: webhookHandleDetails.handleId,
                    url: webhookHandleDetails.url,
                })
                .from(notificationRules)
                .leftJoin(
                    notificationRuleDestinations,
                    and(
                        eq(notificationRuleDestinations.integrationId, notificationRules.integrationId),
                        eq(notificationRuleDestinations.ruleId, notificationRules.id),
                    ),
                )
                .leftJoin(
                    webhookHandleDetails,
                    and(
                        eq(webhookHandleDetails.integrationId, notificationRuleDestinations.integrationId),
                        eq(webhookHandleDetails.handleId, notificationRuleDestinations.handleId),
                    ),
                )
                .where(and(...conditions));
        },
    });

    const ruleIds = [...new Set(rows.map((row) => row.ruleId))];
    const targets = new Map<string, HandleTarget>();
    for (const row of rows) {
        if (row.handleId === null || row.url === null) continue;
        const target = targets.get(row.handleId) ?? {handleId: row.handleId, url: row.url, includeLogDetails: false};
        target.includeLogDetails ||= row.includeLogDetails;
        targets.set(row.handleId, target);
    }
    return {ruleIds, targets: [...targets.values()]};
}

async function sendSlackNotification(
    webhookUrl: string,
    body: SlackPayload,
    logContext: {integrationId: string; jobId: number; handleId: string},
    logger: ReturnType<typeof getLogger>,
) {
    try {
        const res = await proxyFetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            throw new Error(`Slack webhook failed with status ${res.status} and body ${await res.text()}`);
        }
        logger.info(`Successfully sent alert to Slack handle ${logContext.handleId}`, logContext);
    } catch (error) {
        logger.error(`Failed to send Slack notification to handle ${logContext.handleId}`, {...logContext, error});
    }
}
