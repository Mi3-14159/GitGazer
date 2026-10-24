import {getLogger} from '@gitgazer/backend-core/logger';
import {withRlsTransaction} from '@gitgazer/db/client';
import {workflowJobs} from '@gitgazer/db/schema';
import type {WorkflowJobWithRelations} from '@gitgazer/db/types';
import {and, desc, eq, inArray, ne} from 'drizzle-orm';

export const HISTORY_WINDOW = 30;
export const MIN_HISTORY = 5;
export const FLAKY_MIN_RECOVERIES = 2;
export const REAL_MIN_STREAK = 5;

export type JobHistoryEntry = {
    runId: number;
    runAttempt: number;
    conclusion: string;
    headBranch: string | null;
    completedAt: Date;
};

export type Verdict = {kind: 'flaky' | 'real' | 'unknown'; evidence: string | null};

const UNKNOWN: Verdict = {kind: 'unknown', evidence: null};

const countRecoveries = (history: JobHistoryEntry[]): number => {
    const attemptsByRun = new Map<number, JobHistoryEntry[]>();
    for (const entry of history) {
        attemptsByRun.set(entry.runId, [...(attemptsByRun.get(entry.runId) ?? []), entry]);
    }

    let recoveries = 0;
    for (const attempts of attemptsByRun.values()) {
        const firstFailure = Math.min(...attempts.filter((e) => e.conclusion === 'failure').map((e) => e.runAttempt));
        if (attempts.some((e) => e.conclusion === 'success' && e.runAttempt > firstFailure)) {
            recoveries++;
        }
    }
    return recoveries;
};

const leadingSuccesses = (entries: JobHistoryEntry[]): number => {
    const firstNonSuccess = entries.findIndex((e) => e.conclusion !== 'success');
    return firstNonSuccess === -1 ? entries.length : firstNonSuccess;
};

export const classifyVerdict = (history: JobHistoryEntry[], current: {headBranch: string | null; defaultBranch: string}): Verdict => {
    if (history.length < MIN_HISTORY) return UNKNOWN;

    const recoveries = countRecoveries(history);
    if (recoveries >= FLAKY_MIN_RECOVERIES) {
        const failures = history.filter((e) => e.conclusion === 'failure').length;
        return {kind: 'flaky', evidence: `failed ${failures} of last ${history.length} runs; ${recoveries} passed on rerun`};
    }
    if (recoveries > 0) return UNKNOWN;

    const onCurrent = current.headBranch ? history.filter((e) => e.headBranch === current.headBranch) : [];
    const useCurrent = current.headBranch !== null && onCurrent.length >= REAL_MIN_STREAK;
    const branch = useCurrent ? current.headBranch! : current.defaultBranch;
    const streak = leadingSuccesses(useCurrent ? onCurrent : history.filter((e) => e.headBranch === current.defaultBranch));
    if (streak >= REAL_MIN_STREAK) {
        return {kind: 'real', evidence: `passed ${streak}× in a row on ${branch} before this`};
    }
    return UNKNOWN;
};

export const loadJobHistory = async (job: WorkflowJobWithRelations): Promise<JobHistoryEntry[]> => {
    const rows = await withRlsTransaction({
        integrationIds: [job.integrationId],
        readOnly: true,
        callback: async (tx) =>
            tx
                .select({
                    runId: workflowJobs.runId,
                    runAttempt: workflowJobs.runAttempt,
                    conclusion: workflowJobs.conclusion,
                    headBranch: workflowJobs.headBranch,
                    completedAt: workflowJobs.completedAt,
                })
                .from(workflowJobs)
                .where(
                    and(
                        eq(workflowJobs.integrationId, job.integrationId),
                        eq(workflowJobs.repositoryId, job.repositoryId),
                        eq(workflowJobs.workflowName, job.workflowName),
                        eq(workflowJobs.name, job.name),
                        inArray(workflowJobs.conclusion, ['success', 'failure']),
                        ne(workflowJobs.id, job.id),
                    ),
                )
                .orderBy(desc(workflowJobs.completedAt))
                .limit(HISTORY_WINDOW),
    });

    return rows.flatMap((row) => (row.completedAt && row.conclusion ? [{...row, conclusion: row.conclusion, completedAt: row.completedAt}] : []));
};

export const computeVerdict = async (job: WorkflowJobWithRelations): Promise<Verdict> => {
    try {
        const history = await loadJobHistory(job);
        return classifyVerdict(history, {headBranch: job.headBranch, defaultBranch: job.repository.defaultBranch});
    } catch (error) {
        getLogger().warn('Failed to compute failure verdict', {
            integrationId: job.integrationId,
            repositoryId: job.repositoryId,
            jobId: job.id,
            error,
        });
        return UNKNOWN;
    }
};
