import {inspect} from 'node:util';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: vi.fn(),
}));

/** Serialize a Drizzle SQL object to a debug string (handles circular refs). */
const sqlToString = (query: unknown): string => inspect(query, {depth: 10, maxStringLength: Infinity});

let rds: typeof import('@gitgazer/db/client');
let metrics: typeof import('@gitgazer/db/queries/metrics');

describe('metrics queries', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        rds = await import('@gitgazer/db/client');
        metrics = await import('@gitgazer/db/queries/metrics');
    });

    describe('getPRCycleTime', () => {
        const mockExecute = (rows: Record<string, unknown>[]) => {
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {execute: vi.fn().mockResolvedValue({rows})};
                return params.callback(tx);
            });
        };

        it('returns metric with correct shape and unit', async () => {
            // 2026-03-09 is the Monday date_trunc('week') boundary for data around 2026-03-10.
            mockExecute([{period: '2026-03-09T00:00:00Z', value: 4.5}]);

            const result = await metrics.getPRCycleTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(result.metric).toBe('PR Cycle Time');
            expect(result.unit).toBe('hours');
            // Weeks (Mon) spanning the range: 2026-02-23, 2026-03-02, 2026-03-09.
            expect(result.data).toHaveLength(3);
            const populated = result.data.find((d) => d.value === 4.5);
            expect(populated?.period).toBe('2026-03-09T00:00:00.000Z');
        });

        it('zero-fills the period axis when no merged PRs exist', async () => {
            mockExecute([]);

            const result = await metrics.getPRCycleTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'day'},
            });

            // Daily buckets from 2026-03-01 through 2026-03-15 inclusive, all zero.
            expect(result.data).toHaveLength(15);
            expect(result.data.every((d) => d.value === 0)).toBe(true);
            expect(result.data[0].period).toBe('2026-03-01T00:00:00.000Z');
        });

        it('rounds values to two decimal places', async () => {
            mockExecute([{period: '2026-03-09T00:00:00Z', value: 3.14159}]);

            const result = await metrics.getPRCycleTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            const populated = result.data.find((d) => d.period === '2026-03-09T00:00:00.000Z');
            expect(populated?.value).toBe(3.14);
        });

        it('handles null values gracefully', async () => {
            mockExecute([{period: '2026-03-10T00:00:00Z', value: null}]);

            const result = await metrics.getPRCycleTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(result.data[0].value).toBe(0);
        });

        it('uses percentile_cont in the SQL query (median, not mean)', async () => {
            let capturedSql = '';
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {
                    execute: vi.fn().mockImplementation((query: any) => {
                        // Capture the SQL string for inspection
                        const sqlStr = query?.queryChunks
                            ?.map((c: any) => (typeof c === 'string' ? c : (c?.value ?? c?.toString?.() ?? '')))
                            .join('');
                        if (sqlStr) capturedSql += sqlStr;
                        return {rows: []};
                    }),
                };
                return params.callback(tx);
            });

            await metrics.getPRCycleTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(capturedSql).toContain('percentile_cont');
        });

        it('defaults granularity to week', async () => {
            mockExecute([]);

            const result = await metrics.getPRCycleTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {},
            });

            expect(result.metric).toBe('PR Cycle Time');
        });
    });

    describe('getCIDuration', () => {
        const captureSql = () => {
            const calls: string[] = [];
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {
                    execute: vi.fn().mockImplementation((query: any) => {
                        calls.push(sqlToString(query));
                        return {rows: []};
                    }),
                };
                return params.callback(tx);
            });
            return calls;
        };

        it('returns metric with correct shape and unit', async () => {
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {execute: vi.fn().mockResolvedValue({rows: [{period: '2026-03-09T00:00:00Z', value: 12.5}]})};
                return params.callback(tx);
            });

            const result = await metrics.getCIDuration({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(result.metric).toBe('CI Duration');
            expect(result.unit).toBe('minutes');
            expect(result.data).toHaveLength(3);
            const populated = result.data.find((d) => d.value === 12.5);
            expect(populated?.period).toBe('2026-03-09T00:00:00.000Z');
        });

        it('applies topics filter in SQL', async () => {
            const calls = captureSql();

            await metrics.getCIDuration({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', topics: ['backend']},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain('topics');
        });

        it('applies defaultBranchOnly filter in SQL', async () => {
            const calls = captureSql();

            await metrics.getCIDuration({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', defaultBranchOnly: true},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain('default_branch');
        });

        it('applies usersOnly filter in SQL', async () => {
            const calls = captureSql();

            await metrics.getCIDuration({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', usersOnly: true},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain('Bot');
        });
    });

    describe('getMeanTimeToRecovery', () => {
        const captureSql = () => {
            const calls: string[] = [];
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {
                    execute: vi.fn().mockImplementation((query: any) => {
                        calls.push(sqlToString(query));
                        return {rows: []};
                    }),
                };
                return params.callback(tx);
            });
            return calls;
        };

        it('returns metric with correct shape and unit', async () => {
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {execute: vi.fn().mockResolvedValue({rows: [{period: '2026-03-10T00:00:00Z', value: 1.5}]})};
                return params.callback(tx);
            });

            const result = await metrics.getMeanTimeToRecovery({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(result.metric).toBe('Mean Time to Recovery');
            expect(result.unit).toBe('hours');
        });

        it('applies topics filter in SQL', async () => {
            const calls = captureSql();

            await metrics.getMeanTimeToRecovery({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', topics: ['infra']},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain('topics');
        });

        it('applies defaultBranchOnly filter in SQL', async () => {
            const calls = captureSql();

            await metrics.getMeanTimeToRecovery({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', defaultBranchOnly: true},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain('default_branch');
        });

        it('applies usersOnly filter in SQL', async () => {
            const calls = captureSql();

            await metrics.getMeanTimeToRecovery({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', usersOnly: true},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain('Bot');
        });
    });

    describe('group by integration', () => {
        const captureSql = () => {
            const calls: string[] = [];
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {
                    execute: vi.fn().mockImplementation((query: any) => {
                        calls.push(sqlToString(query));
                        return {rows: []};
                    }),
                };
                return params.callback(tx);
            });
            return calls;
        };

        it('builds one series per integration from grouped rows', async () => {
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {
                    execute: vi.fn().mockResolvedValue({
                        rows: [
                            {group_key: '11111111-1111-1111-1111-111111111111', group_label: 'Acme', period: '2026-03-10T00:00:00Z', value: 3},
                            {group_key: '22222222-2222-2222-2222-222222222222', group_label: 'Globex', period: '2026-03-10T00:00:00Z', value: 5},
                        ],
                    }),
                };
                return params.callback(tx);
            });

            const result = await metrics.getDeploymentFrequency({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', groupBy: 'integration'},
            });

            expect(result.data).toEqual([]);
            expect(result.series).toHaveLength(2);
            expect(result.series?.map((s) => s.groupLabel)).toEqual(['Acme', 'Globex']);
            expect(result.series?.[0].groupKey).toBe('11111111-1111-1111-1111-111111111111');
        });

        it('joins the integrations table for a standard metric', async () => {
            const calls = captureSql();

            await metrics.getDeploymentFrequency({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', groupBy: 'integration'},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain('group_label');
            expect(allSql).toContain('org_sync_default_role');
        });

        it('joins the integrations table for Mean Time to Recovery', async () => {
            const calls = captureSql();

            await metrics.getMeanTimeToRecovery({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', groupBy: 'integration'},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain('i.label as group_label');
            expect(allSql).toContain('org_sync_default_role');
        });

        it('joins the integrations table for PR Review Time', async () => {
            const calls = captureSql();

            await metrics.getPRReviewTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week', groupBy: 'integration'},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain('i.label as group_label');
            expect(allSql).toContain('org_sync_default_role');
        });
    });

    describe('integration scope (sargable predicate)', () => {
        const captureSql = () => {
            const calls: string[] = [];
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {
                    execute: vi.fn().mockImplementation((query: any) => {
                        calls.push(sqlToString(query));
                        return {rows: []};
                    }),
                };
                return params.callback(tx);
            });
            return calls;
        };

        // The integration id only reaches the query text via the explicit sargable predicate:
        // RLS scoping is applied out-of-band (SET LOCAL rls.integration_ids), never inlined into
        // the query. So finding the id in the captured SQL proves the index-friendly predicate exists.
        const SINGLE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const SECOND = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

        it('adds an explicit integration_id predicate for a condition-array metric', async () => {
            const calls = captureSql();

            await metrics.getDeploymentFrequency({
                integrationIds: [SINGLE],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(calls.join(' ')).toContain(SINGLE);
        });

        it('uses an IN list when multiple integrations are selected', async () => {
            const calls = captureSql();

            await metrics.getDeploymentFrequency({
                integrationIds: [SINGLE, SECOND],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            const allSql = calls.join(' ');
            expect(allSql).toContain(SINGLE);
            expect(allSql).toContain(SECOND);
        });

        it('adds an explicit integration_id predicate for a UNION metric', async () => {
            const calls = captureSql();

            await metrics.getActivityVolume({
                integrationIds: [SINGLE],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(calls.join(' ')).toContain(SINGLE);
        });

        it('adds an explicit integration_id predicate for a CTE metric', async () => {
            const calls = captureSql();

            await metrics.getMeanTimeToRecovery({
                integrationIds: [SINGLE],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(calls.join(' ')).toContain(SINGLE);
        });

        it('adds an explicit integration_id predicate for a pull-request metric', async () => {
            const calls = captureSql();

            await metrics.getPRCycleTime({
                integrationIds: [SINGLE],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(calls.join(' ')).toContain(SINGLE);
        });
    });

    describe('zero-fill of empty periods', () => {
        const mockRows = (rows: Record<string, unknown>[]) => {
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {execute: vi.fn().mockResolvedValue({rows})};
                return params.callback(tx);
            });
        };

        it('fills a missing middle period with value 0 (daily)', async () => {
            // Data on the first and last day; the middle days have no rows.
            mockRows([
                {period: '2026-03-01T00:00:00Z', value: 5},
                {period: '2026-03-04T00:00:00Z', value: 9},
            ]);

            const result = await metrics.getActivityVolume({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-04', granularity: 'day'},
            });

            expect(result.data).toEqual([
                {period: '2026-03-01T00:00:00.000Z', value: 5},
                {period: '2026-03-02T00:00:00.000Z', value: 0},
                {period: '2026-03-03T00:00:00.000Z', value: 0},
                {period: '2026-03-04T00:00:00.000Z', value: 9},
            ]);
        });

        it('produces one point per period for the range and keeps them ordered (weekly, Monday boundaries)', async () => {
            mockRows([{period: '2026-03-02T00:00:00Z', value: 3}]);

            const result = await metrics.getDeploymentFrequency({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-22', granularity: 'week'},
            });

            // Mondays spanning the range: 02-23, 03-02, 03-09, 03-16.
            expect(result.data.map((d) => d.period)).toEqual([
                '2026-02-23T00:00:00.000Z',
                '2026-03-02T00:00:00.000Z',
                '2026-03-09T00:00:00.000Z',
                '2026-03-16T00:00:00.000Z',
            ]);
            const sorted = [...result.data].sort((a, b) => a.period.localeCompare(b.period));
            expect(result.data).toEqual(sorted);
            expect(result.data.find((d) => d.period === '2026-03-02T00:00:00.000Z')?.value).toBe(3);
        });

        it('fills monthly periods across a year boundary', async () => {
            mockRows([{period: '2026-01-01T00:00:00Z', value: 7}]);

            const result = await metrics.getDeploymentFrequency({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2025-11-15', to: '2026-02-10', granularity: 'month'},
            });

            expect(result.data.map((d) => d.period)).toEqual([
                '2025-11-01T00:00:00.000Z',
                '2025-12-01T00:00:00.000Z',
                '2026-01-01T00:00:00.000Z',
                '2026-02-01T00:00:00.000Z',
            ]);
            expect(result.data.find((d) => d.period === '2026-01-01T00:00:00.000Z')?.value).toBe(7);
        });

        it('fills every grouped series with the full period spine (aligned x-axis)', async () => {
            mockRows([
                {group_key: 'a', group_label: 'Acme', period: '2026-03-01T00:00:00Z', value: 2},
                {group_key: 'b', group_label: 'Globex', period: '2026-03-03T00:00:00Z', value: 4},
            ]);

            const result = await metrics.getDeploymentFrequency({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-03', granularity: 'day', groupBy: 'integration'},
            });

            expect(result.data).toEqual([]);
            expect(result.series).toHaveLength(2);
            const expectedPeriods = ['2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z', '2026-03-03T00:00:00.000Z'];
            for (const series of result.series ?? []) {
                expect(series.data.map((d) => d.period)).toEqual(expectedPeriods);
            }
            // Acme has data only on day 1, Globex only on day 3; the gaps are zero-filled.
            const acme = result.series?.find((s) => s.groupKey === 'a');
            const globex = result.series?.find((s) => s.groupKey === 'b');
            expect(acme?.data.map((d) => d.value)).toEqual([2, 0, 0]);
            expect(globex?.data.map((d) => d.value)).toEqual([0, 0, 4]);
        });
    });
});
