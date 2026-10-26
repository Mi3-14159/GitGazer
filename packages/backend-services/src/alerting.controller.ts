import {findPullRequest, loadLogDetails, type DetailsSkipReason, type LogDetails} from './alerting/log-details';
import {buildSlackAlert, type SlackAlertInput} from './alerting/slack-payload';
import {computeVerdict} from './alerting/verdict';
import {createEventLogEntry} from './event-log.controller';
import {resolveSlackUserId} from './slack/links';
import {loadWorkspaceForIntegration, markWorkspaceDisconnected} from './slack/workspaces';
import {proxyFetch} from '@gitgazer/backend-core/clients/proxy-fetch';
import {isRevokedSlackError, postMessage, slackErrorReason} from '@gitgazer/backend-core/clients/slack.client';
import config from '@gitgazer/backend-core/config';
import {withTimeout} from '@gitgazer/backend-core/helpers/async';
import {getLogger} from '@gitgazer/backend-core/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {notificationRuleDestinations, notificationRules, slackHandleDetails, webhookHandleDetails} from '@gitgazer/db/schema';
import {WorkflowConclusion, WorkflowJobWithRelations, type SlackPayload} from '@gitgazer/db/types';
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

const SENDER_LOOKUP_TIMEOUT_MS = 3000;

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
    const {ruleIds, targets: matchedTargets} = await findMatchingRulesAndTargets(workflowJob, context);

    if (ruleIds.length === 0) {
        logger.info(`No matching notification rules for integration ${workflowJob.integrationId}`, logIds);
        return;
    }

    logger.info(`Found ${ruleIds.length} matching notification rules for integration ${workflowJob.integrationId}`, {
        ...logIds,
        ruleIds,
    });

    let workspace: Awaited<ReturnType<typeof loadWorkspaceForIntegration>> = null;
    if (matchedTargets.some((target) => target.kind === 'slack')) {
        workspace = await loadWorkspaceForIntegration(workflowJob.integrationId).catch((error) => {
            logger.error('Failed to load the Slack workspace', {...logIds, reason: slackErrorReason(error)});
            return null;
        });
        if (workspace?.disconnected) workspace = null;
        if (!workspace) logger.warn('Skipping Slack handles: the Slack app is not connected', logIds);
    }
    const targets = workspace ? matchedTargets : matchedTargets.filter((target) => target.kind === 'webhook');

    const sender = workflowJob.sender;
    const [verdict, pullRequest, senderSlackUserId] = await Promise.all([
        computeVerdict(workflowJob),
        findPullRequest(workflowJob),
        workspace && sender?.id && sender.type === 'User'
            ? withTimeout(
                  resolveSlackUserId({
                      teamId: workspace.teamId,
                      botToken: workspace.botToken,
                      integrationId: workflowJob.integrationId,
                      githubUserId: sender.id,
                      githubLogin: sender.login,
                      // An empty owner would match no installation; null lets the lookup use any of them.
                      ownerLogin: context.ownerLogin || null,
                  }),
                  SENDER_LOOKUP_TIMEOUT_MS,
              ).catch((error) => {
                  logger.warn('Slack sender lookup gave up, sending without a mention', {...logIds, reason: slackErrorReason(error)});
                  return null;
              })
            : null,
    ]);
    let slackAttempted = false;

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

        const alertInput: Omit<SlackAlertInput, 'details' | 'senderSlackUserId'> = {
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
            const targetDetails = target.includeLogDetails ? details : null;
            if (target.kind === 'webhook') {
                const body = buildSlackAlert({...alertInput, senderSlackUserId: null, details: targetDetails});
                await sendSlackNotification(target.url, body, {...logIds, handleId: target.handleId}, logger);
                continue;
            }
            // Cleared after a revoked token so the remaining Slack handles of this alert are skipped.
            if (!workspace) continue;

            slackAttempted = true;
            const body = buildSlackAlert({...alertInput, senderSlackUserId, details: targetDetails});
            try {
                await postMessage(workspace.botToken, target.channelId, body);
                logger.info(`Successfully sent alert to Slack handle ${target.handleId}`, {...logIds, handleId: target.handleId});
            } catch (error) {
                logger.error(`Failed to send Slack message to handle ${target.handleId}`, {
                    ...logIds,
                    handleId: target.handleId,
                    reason: slackErrorReason(error),
                });
                if (isRevokedSlackError(error)) {
                    await disconnectWorkspace(workspace.teamId, logIds, logger);
                    workspace = null;
                }
            }
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
                mentioned: Boolean(senderSlackUserId) && slackAttempted,
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

type HandleTarget =
    | {kind: 'webhook'; handleId: string; url: string; includeLogDetails: boolean}
    | {kind: 'slack'; handleId: string; channelId: string; includeLogDetails: boolean};

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
                    handleId: notificationRuleDestinations.handleId,
                    url: webhookHandleDetails.url,
                    channelId: slackHandleDetails.channelId,
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
                .leftJoin(
                    slackHandleDetails,
                    and(
                        eq(slackHandleDetails.integrationId, notificationRuleDestinations.integrationId),
                        eq(slackHandleDetails.handleId, notificationRuleDestinations.handleId),
                    ),
                )
                .where(and(...conditions));
        },
    });

    const ruleIds = [...new Set(rows.map((row) => row.ruleId))];
    const targets = new Map<string, HandleTarget>();
    for (const row of rows) {
        if (row.handleId === null) continue;
        let target = targets.get(row.handleId);
        if (!target) {
            if (row.url !== null) {
                target = {kind: 'webhook', handleId: row.handleId, url: row.url, includeLogDetails: false};
            } else if (row.channelId !== null) {
                target = {kind: 'slack', handleId: row.handleId, channelId: row.channelId, includeLogDetails: false};
            } else {
                continue;
            }
        }
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

async function disconnectWorkspace(teamId: string, logIds: {integrationId: string; jobId: number}, logger: ReturnType<typeof getLogger>) {
    try {
        const integrationIds = await markWorkspaceDisconnected(teamId);
        logger.warn('Slack app disconnected: token revoked, skipping the remaining Slack handles', {
            ...logIds,
            affectedIntegrations: integrationIds.length,
        });
        for (const integrationId of integrationIds) {
            await createEventLogEntry({
                integrationId,
                category: 'integration',
                type: 'warning',
                title: 'Slack app disconnected',
                message: 'Slack revoked GitGazer access to the workspace. Reinstall the Slack app to send alerts to Slack again.',
            }).catch((error) => logger.error('Failed to create event log entry', {...logIds, error}));
        }
    } catch (error) {
        logger.error('Failed to mark the Slack workspace disconnected', {...logIds, error});
    }
}
