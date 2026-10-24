import type {WorkflowJobWithRelations} from '@gitgazer/db/types';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWithRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
}));

vi.mock('@gitgazer/db/schema', () => ({
    workflowJobs: {
        integrationId: 'integrationId',
        repositoryId: 'repositoryId',
        workflowName: 'workflowName',
        name: 'name',
        id: 'id',
        conclusion: 'conclusion',
        completedAt: 'completedAt',
        runId: 'runId',
        runAttempt: 'runAttempt',
        headBranch: 'headBranch',
    },
}));

const mockLt = vi.fn();
const mockNe = vi.fn();
const mockInArray = vi.fn();
vi.mock('drizzle-orm', async (importOriginal) => {
    const actual = await importOriginal<typeof import('drizzle-orm')>();
    return {
        ...actual,
        lt: (...args: Parameters<typeof actual.lt>) => (mockLt(...args), actual.lt(...args)),
        ne: (...args: Parameters<typeof actual.ne>) => (mockNe(...args), actual.ne(...args)),
        inArray: (...args: Parameters<typeof actual.inArray>) => (mockInArray(...args), actual.inArray(...args)),
    };
});

const mockWarn = vi.fn();
vi.mock('@gitgazer/backend-core/logger', () => ({
    getLogger: () => ({warn: mockWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn()}),
}));

import {classifyVerdict, computeVerdict, loadJobHistory, type JobHistoryEntry} from './verdict';

const current = {headBranch: 'feature', defaultBranch: 'main'};
let seq = 0;
const entry = (conclusion: JobHistoryEntry['conclusion'], over: Partial<JobHistoryEntry> = {}): JobHistoryEntry => ({
    runId: 1000 + seq++,
    runAttempt: 1,
    conclusion,
    headBranch: 'feature',
    completedAt: new Date(2026, 9, 24, 12, 0, 60 - seq),
    ...over,
});
const recovery = (runId: number, branch = 'feature'): JobHistoryEntry[] => [
    entry('success', {runId, runAttempt: 2, headBranch: branch}),
    entry('failure', {runId, runAttempt: 1, headBranch: branch}),
];

const job = {
    integrationId: 'int-1',
    repositoryId: 7,
    workflowName: 'CI',
    name: 'test',
    id: 99,
    runId: 500,
    headBranch: 'feature',
    completedAt: new Date('2026-10-24T12:00:00Z'),
    repository: {defaultBranch: 'main'},
} as unknown as WorkflowJobWithRelations;

describe('classifyVerdict', () => {
    it('unknown with fewer than 5 runs', () => {
        const history = [entry('success'), entry('success'), entry('success'), entry('success')];
        expect(classifyVerdict(history, current)).toEqual({kind: 'unknown', evidence: null});
    });

    it('flaky with two rerun recoveries', () => {
        const history = [...recovery(1), ...recovery(2), entry('success'), entry('success'), entry('success')];
        expect(classifyVerdict(history, current)).toEqual({kind: 'flaky', evidence: 'failed 2 of last 5 runs; 2 passed on rerun'});
    });

    it('counts reruns of one run as a single run', () => {
        const threeAttempts = (runId: number) => [
            entry('success', {runId, runAttempt: 3}),
            entry('failure', {runId, runAttempt: 2}),
            entry('failure', {runId, runAttempt: 1}),
        ];
        expect(classifyVerdict([...threeAttempts(1), ...threeAttempts(2)], current)).toEqual({kind: 'unknown', evidence: null});
    });

    it('reports runs, not attempts, in the flaky evidence', () => {
        const history = [
            entry('success', {runId: 1, runAttempt: 3}),
            entry('failure', {runId: 1, runAttempt: 2}),
            entry('failure', {runId: 1, runAttempt: 1}),
            ...recovery(2),
            entry('success'),
            entry('success'),
            entry('success'),
        ];
        expect(classifyVerdict(history, current)).toEqual({kind: 'flaky', evidence: 'failed 2 of last 5 runs; 2 passed on rerun'});
    });

    it('does not count a success followed by a later failure as a recovery', () => {
        const history = [
            entry('failure', {runId: 1, runAttempt: 2}),
            entry('success', {runId: 1, runAttempt: 1}),
            ...recovery(2),
            entry('success'),
            entry('success'),
            entry('success'),
        ];
        expect(classifyVerdict(history, current)).toEqual({kind: 'unknown', evidence: null});
    });

    it('real after a clean streak on the same branch', () => {
        const history = Array.from({length: 5}, () => entry('success'));
        expect(classifyVerdict(history, current)).toEqual({kind: 'real', evidence: 'passed 5× in a row on feature before this'});
    });

    it('real falls back to default-branch streak', () => {
        const history = [entry('success'), ...Array.from({length: 5}, () => entry('success', {headBranch: 'main'}))];
        expect(classifyVerdict(history, current)).toEqual({kind: 'real', evidence: 'passed 5× in a row on main before this'});
    });

    it('is not real when the newest runs on the branch include a failure', () => {
        const history = [entry('success'), entry('failure'), ...Array.from({length: 4}, () => entry('success'))];
        expect(classifyVerdict(history, current).kind).toBe('unknown');
    });

    it('unknown when failures are frequent but never recover', () => {
        const history = [entry('failure'), entry('success'), entry('failure'), entry('success'), entry('failure'), entry('success')];
        expect(classifyVerdict(history, current)).toEqual({kind: 'unknown', evidence: null});
    });
});

describe('loadJobHistory', () => {
    beforeEach(() => vi.clearAllMocks());

    const query = (rows: unknown[]) => {
        const q: Record<string, unknown> = {};
        for (const method of ['from', 'where', 'groupBy', 'orderBy', 'limit']) q[method] = vi.fn(() => q);
        q.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject);
        return q as Record<'from' | 'where' | 'groupBy' | 'orderBy' | 'limit', ReturnType<typeof vi.fn>>;
    };
    const mockQueries = (runRows: unknown[], attemptRows: unknown[]) => {
        const runs = query(runRows);
        const attempts = query(attemptRows);
        const select = vi.fn().mockReturnValueOnce(runs).mockReturnValueOnce(attempts);
        mockWithRlsTransaction.mockImplementation(async (p: {callback: Function}) => p.callback({select}));
        return {runs, attempts, select};
    };

    it('loads every attempt of the newest runs, dropping rows without completedAt', async () => {
        const rows = [
            {runId: 1, runAttempt: 2, conclusion: 'success', headBranch: 'main', completedAt: new Date('2026-10-24T10:00:00Z')},
            {runId: 1, runAttempt: 1, conclusion: 'failure', headBranch: 'main', completedAt: null},
        ];
        const {runs, attempts} = mockQueries([{runId: 1}, {runId: 2}], rows);

        const out = await loadJobHistory(job);

        expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({integrationIds: ['int-1']}));
        expect(runs.groupBy).toHaveBeenCalledWith('runId');
        expect(runs.limit).toHaveBeenCalledWith(30);
        expect(mockInArray).toHaveBeenCalledWith('runId', [1, 2]);
        expect(attempts.limit).not.toHaveBeenCalled();
        expect(out).toEqual([rows[0]]);
    });

    it('only includes other runs that completed before this job', async () => {
        mockQueries([], []);

        await loadJobHistory(job);

        expect(mockLt).toHaveBeenCalledWith('completedAt', job.completedAt);
        expect(mockNe).toHaveBeenCalledWith('runId', 500);
    });

    it('skips the attempts query when there are no earlier runs', async () => {
        const {select} = mockQueries([], []);

        expect(await loadJobHistory(job)).toEqual([]);
        expect(select).toHaveBeenCalledTimes(1);
    });

    it('returns no history when this job has no completion time', async () => {
        const out = await loadJobHistory({...job, completedAt: null} as unknown as WorkflowJobWithRelations);

        expect(out).toEqual([]);
        expect(mockWithRlsTransaction).not.toHaveBeenCalled();
    });
});

describe('computeVerdict', () => {
    beforeEach(() => vi.clearAllMocks());

    it('classifies loaded history', async () => {
        const rows = Array.from({length: 5}, (_, i) => ({
            runId: i,
            runAttempt: 1,
            conclusion: 'success',
            headBranch: 'feature',
            completedAt: new Date(2026, 9, 24, 10, i),
        }));
        mockWithRlsTransaction.mockResolvedValue(rows);
        expect(await computeVerdict(job)).toEqual({kind: 'real', evidence: 'passed 5× in a row on feature before this'});
    });

    it('returns unknown when the query throws', async () => {
        mockWithRlsTransaction.mockRejectedValue(new Error('db down'));
        expect(await computeVerdict(job)).toEqual({kind: 'unknown', evidence: null});
        expect(mockWarn).toHaveBeenCalledWith(
            'Failed to compute failure verdict',
            expect.objectContaining({integrationId: 'int-1', repositoryId: 7, jobId: 99, error: expect.any(Error)}),
        );
    });
});
