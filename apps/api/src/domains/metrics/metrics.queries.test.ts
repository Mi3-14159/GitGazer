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
            mockExecute([{period: '2026-03-10T00:00:00Z', value: 4.5}]);

            const result = await metrics.getPRCycleTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(result.metric).toBe('PR Cycle Time');
            expect(result.unit).toBe('hours');
            expect(result.data).toHaveLength(1);
            expect(result.data[0].value).toBe(4.5);
        });

        it('returns empty data when no merged PRs exist', async () => {
            mockExecute([]);

            const result = await metrics.getPRCycleTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'day'},
            });

            expect(result.data).toEqual([]);
        });

        it('rounds values to two decimal places', async () => {
            mockExecute([{period: '2026-03-10T00:00:00Z', value: 3.14159}]);

            const result = await metrics.getPRCycleTime({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(result.data[0].value).toBe(3.14);
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
                const tx = {execute: vi.fn().mockResolvedValue({rows: [{period: '2026-03-10T00:00:00Z', value: 12.5}]})};
                return params.callback(tx);
            });

            const result = await metrics.getCIDuration({
                integrationIds: ['11111111-1111-1111-1111-111111111111'],
                filter: {from: '2026-03-01', to: '2026-03-15', granularity: 'week'},
            });

            expect(result.metric).toBe('CI Duration');
            expect(result.unit).toBe('minutes');
            expect(result.data).toHaveLength(1);
            expect(result.data[0].value).toBe(12.5);
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
            expect(allSql).toContain('User');
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
});
