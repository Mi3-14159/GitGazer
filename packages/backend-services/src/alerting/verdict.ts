import {getLogger} from '@gitgazer/backend-core/logger';
import {withRlsTransaction} from '@gitgazer/db/client';
import {workflowJobs} from '@gitgazer/db/schema';
import type {VerdictKind, WorkflowConclusion, WorkflowJobWithRelations} from '@gitgazer/db/types';
import {and, desc, eq, inArray, lt, max, ne} from 'drizzle-orm';

export const HISTORY_WINDOW = 30;
export const MIN_HISTORY = 5;
export const FLAKY_MIN_RECOVERIES = 2;
export const REAL_MIN_STREAK = 5;

const HISTORY_CONCLUSIONS = ['success', 'failure'] as const satisfies readonly WorkflowConclusion[];
type HistoryConclusion = (typeof HISTORY_CONCLUSIONS)[number];

const isHistoryConclusion = (conclusion: string | null): conclusion is HistoryConclusion => HISTORY_CONCLUSIONS.some((value) => value === conclusion);

export type JobHistoryEntry = {
    runId: number;
    runAttempt: number;
    conclusion: HistoryConclusion;
    headBranch: string | null;
    completedAt: Date;
};

export type Verdict = {kind: VerdictKind; evidence: string | null};

const UNKNOWN: Verdict = {kind: 'unknown', evidence: null};

type RunSummary = {headBranch: string | null; failed: boolean; recovered: boolean; passed: boolean};

/** Folds attempts into runs, newest run first (history is ordered by completion time, newest first). */
const summarizeRuns = (history: JobHistoryEntry[]): RunSummary[] => {
    const attemptsByRun = new Map<number, JobHistoryEntry[]>();
    for (const entry of history) {
        attemptsByRun.set(entry.runId, [...(attemptsByRun.get(entry.runId) ?? []), entry]);
    }

    return [...attemptsByRun.values()].map((attempts) => {
        const firstFailure = Math.min(...attempts.filter((e) => e.conclusion === 'failure').map((e) => e.runAttempt));
        const lastAttempt = attempts.reduce((latest, e) => (e.runAttempt > latest.runAttempt ? e : latest));
        return {
            headBranch: lastAttempt.headBranch,
            failed: Number.isFinite(firstFailure),
            recovered: attempts.some((e) => e.conclusion === 'success' && e.runAttempt > firstFailure),
            passed: lastAttempt.conclusion === 'success',
        };
    });
};

const leadingPasses = (runs: RunSummary[]): number => {
    const firstNotPassed = runs.findIndex((run) => !run.passed);
    return firstNotPassed === -1 ? runs.length : firstNotPassed;
};

export const classifyVerdict = (history: JobHistoryEntry[], current: {headBranch: string | null; defaultBranch: string}): Verdict => {
    const runs = summarizeRuns(history).slice(0, HISTORY_WINDOW);
    if (runs.length < MIN_HISTORY) return UNKNOWN;

    const recoveries = runs.filter((run) => run.recovered).length;
    if (recoveries >= FLAKY_MIN_RECOVERIES) {
        const failures = runs.filter((run) => run.failed).length;
        return {kind: 'flaky', evidence: `failed ${failures} of last ${runs.length} runs; ${recoveries} passed on rerun`};
    }
    if (recoveries > 0) return UNKNOWN;

    const onCurrent = current.headBranch ? runs.filter((run) => run.headBranch === current.headBranch) : [];
    const useCurrent = current.headBranch !== null && onCurrent.length >= REAL_MIN_STREAK;
    const branch = useCurrent ? current.headBranch! : current.defaultBranch;
    const streak = leadingPasses(useCurrent ? onCurrent : runs.filter((run) => run.headBranch === current.defaultBranch));
    if (streak >= REAL_MIN_STREAK) {
        return {kind: 'real', evidence: `passed ${streak}× in a row on ${branch} before this`};
    }
    return UNKNOWN;
};

export const loadJobHistory = async (job: WorkflowJobWithRelations): Promise<JobHistoryEntry[]> => {
    // Without a completion time there is no way to tell which runs came before this one.
    const {completedAt} = job;
    if (!completedAt) return [];

    const rows = await withRlsTransaction({
        integrationIds: [job.integrationId],
        readOnly: true,
        callback: async (tx) => {
            const earlierRuns = and(
                eq(workflowJobs.integrationId, job.integrationId),
                eq(workflowJobs.repositoryId, job.repositoryId),
                eq(workflowJobs.workflowName, job.workflowName),
                eq(workflowJobs.name, job.name),
                inArray(workflowJobs.conclusion, [...HISTORY_CONCLUSIONS]),
                // Other attempts of this run are not history: a failed rerun would otherwise break the streak it is judged against.
                ne(workflowJobs.runId, job.runId),
                // Only jobs that finished before this one, so later completions in the same batch don't count.
                lt(workflowJobs.completedAt, completedAt),
            );

            // Runs first, then all their attempts: limiting attempts directly could keep a rerun's success but drop its original failure.
            const recentRuns = await tx
                .select({runId: workflowJobs.runId})
                .from(workflowJobs)
                .where(earlierRuns)
                .groupBy(workflowJobs.runId)
                .orderBy(desc(max(workflowJobs.completedAt)))
                .limit(HISTORY_WINDOW);
            if (recentRuns.length === 0) return [];

            return tx
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
                        earlierRuns,
                        inArray(
                            workflowJobs.runId,
                            recentRuns.map((run) => run.runId),
                        ),
                    ),
                )
                .orderBy(desc(workflowJobs.completedAt));
        },
    });

    return rows.flatMap(({conclusion, completedAt, ...row}) =>
        completedAt && isHistoryConclusion(conclusion) ? [{...row, conclusion, completedAt}] : [],
    );
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
