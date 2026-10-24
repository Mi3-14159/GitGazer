import {downloadJobLog} from '@gitgazer/backend-core/clients/github-app.client';
import config from '@gitgazer/backend-core/config';
import {withTimeout} from '@gitgazer/backend-core/helpers/async';
import {getLogger} from '@gitgazer/backend-core/logger';
import {extractErrorExcerpt, failedStepTail} from './job-log';
import {summarizeFailure} from './summary';
import type {Verdict} from './verdict';
import {withRlsTransaction} from '@gitgazer/db/client';
import {githubAppInstallations, pullRequests, workflowRunPullRequests} from '@gitgazer/db/schema';
import type {WorkflowJobWithRelations} from '@gitgazer/db/types';
import {and, asc, eq, sql} from 'drizzle-orm';

const LOG_TAIL_CHARS = 32_000;
const MAX_CONTEXT_CHARS = 500;

export type LogDetails = {summary: string | null; excerpt: string | null};

const truncate = (text: string | null | undefined): string | null => (text ? text.slice(0, MAX_CONTEXT_CHARS) : null);

const errorFields = (error: unknown) => ({
    errorName: error instanceof Error ? error.name : 'UnknownError',
    status: typeof (error as {status?: unknown})?.status === 'number' ? (error as {status: number}).status : undefined,
});

export const findInstallationId = async (integrationId: string, ownerLogin: string): Promise<number | null> => {
    const [row] = await withRlsTransaction({
        integrationIds: [integrationId],
        readOnly: true,
        callback: async (tx) =>
            tx
                .select({installationId: githubAppInstallations.installationId})
                .from(githubAppInstallations)
                .where(
                    and(
                        eq(githubAppInstallations.integrationId, integrationId),
                        sql`lower(${githubAppInstallations.accountLogin}) = lower(${ownerLogin})`,
                    ),
                )
                .limit(1),
    });
    return row?.installationId ?? null;
};

export const findPullRequest = async (job: WorkflowJobWithRelations): Promise<{number: number; title: string} | null> => {
    try {
        const [row] = await withRlsTransaction({
            integrationIds: [job.integrationId],
            readOnly: true,
            callback: async (tx) =>
                tx
                    .select({number: pullRequests.number, title: pullRequests.title})
                    .from(workflowRunPullRequests)
                    .innerJoin(
                        pullRequests,
                        and(
                            eq(pullRequests.integrationId, workflowRunPullRequests.integrationId),
                            eq(pullRequests.id, workflowRunPullRequests.pullRequestId),
                        ),
                    )
                    .where(
                        and(
                            eq(workflowRunPullRequests.integrationId, job.integrationId),
                            eq(workflowRunPullRequests.workflowRunId, job.workflowRunId),
                        ),
                    )
                    .orderBy(asc(pullRequests.number))
                    .limit(1),
        });
        return row ?? null;
    } catch (error) {
        getLogger().warn('Failed to look up pull request for alert', {
            integrationId: job.integrationId,
            workflowRunId: job.workflowRunId,
            jobId: job.id,
            ...errorFields(error),
        });
        return null;
    }
};

export const loadLogDetails = async (
    job: WorkflowJobWithRelations,
    verdict: Verdict,
    pullRequestTitle: string | null,
): Promise<LogDetails | null> => {
    const logger = getLogger();
    const owner = job.repository.owner?.login ?? '';
    const repo = job.repository.name;
    const ids = {integrationId: job.integrationId, jobId: job.id};

    let installationId: number | null;
    try {
        installationId = owner ? await findInstallationId(job.integrationId, owner) : null;
    } catch (error) {
        logger.warn('Log details skipped, installation lookup failed', {...ids, ...errorFields(error)});
        return null;
    }
    if (installationId === null) {
        logger.info('Log details skipped', {...ids, skipReason: 'no_installation'});
        return null;
    }

    let log: string;
    try {
        log = await withTimeout(downloadJobLog(installationId, owner, repo, job.id), config.get('alerts').logFetchTimeoutMs);
    } catch (error) {
        // A 403 is expected until the installation accepts the Actions: read permission.
        logger.warn('Log details skipped', {...ids, installationId, skipReason: 'download_failed', ...errorFields(error)});
        return null;
    }

    const summary = await summarizeFailure(job.integrationId, {
        repository: owner ? `${owner}/${repo}` : repo,
        workflowName: job.workflowName,
        jobName: job.name,
        branch: job.headBranch,
        verdict,
        commitMessage: truncate(job.workflowRun?.headCommitMessage),
        pullRequestTitle: truncate(pullRequestTitle),
        logTail: failedStepTail(log, LOG_TAIL_CHARS),
    });

    return {excerpt: extractErrorExcerpt(log), summary};
};
