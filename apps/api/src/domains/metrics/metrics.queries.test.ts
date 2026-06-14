import {inspect} from 'node:util';
import {type SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: vi.fn(),
}));

/** Serialize a Drizzle SQL object to a debug string (handles circular refs). */
const sqlToString = (query: unknown): string => inspect(query, {depth: 10, maxStringLength: Infinity});

const dialect = new PgDialect();

/**
 * Render a Drizzle SQL object to its fully-resolved, parameterized SQL text.
 * Unlike a shallow `queryChunks` join, this recurses into nested `sql` fragments
 * (group-by SELECT, lateral joins, etc.) and renders Drizzle column objects, so
 * characterization assertions can lock alias-specific tokens like `r.topics`.
 */
const renderSql = (query: SQL): string => dialect.sqlToQuery(query).sql;

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

    // --- Characterization tests for the duplicated custom-CTE group-by blocks ---
    // getMeanTimeToRecovery and getPRReviewTime each run over a custom CTE, so they cannot
    // use getGroupByExpressions(). They re-implement the same group-by SQL by hand, and the
    // two copies have drifted (table aliases r vs repo, integration join source r vs fr, and
    // the repo-topics filter). These tests capture the *currently generated* SQL for each
    // metric across every groupBy mode (with/without a topics filter) so that a later refactor
    // extracting a shared helper can prove it preserved (or deliberately changed) the output.

    describe('getMeanTimeToRecovery group-by SQL', () => {
        const INTEGRATION = '11111111-1111-1111-1111-111111111111';
        const renderGroupBySql = async (filter: Record<string, unknown>): Promise<string> => {
            let sqlText = '';
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {
                    execute: vi.fn().mockImplementation((query: SQL) => {
                        sqlText += renderSql(query);
                        return {rows: []};
                    }),
                };
                return params.callback(tx);
            });
            await metrics.getMeanTimeToRecovery({integrationIds: [INTEGRATION], filter: filter as any});
            return sqlText;
        };

        it('groupBy=repository selects and joins on the r alias', async () => {
            const sql = await renderGroupBySql({groupBy: 'repository'});
            expect(sql).toContain('r.id::text as group_key');
            expect(sql).toContain('r.name as group_label');
            expect(sql).toContain('JOIN "github"."repositories" r');
        });

        it('groupBy=topic uses a lateral over jsonb_array_elements_text(r.topics)', async () => {
            const sql = await renderGroupBySql({groupBy: 'topic'});
            expect(sql).toContain('t.topic as group_key, t.topic as group_label');
            expect(sql).toContain('jsonb_array_elements_text(r.topics)');
        });

        it('groupBy=topic with topics filter scopes the lateral with value = ANY(...)', async () => {
            const sql = await renderGroupBySql({groupBy: 'topic', topics: ['x', 'y']});
            expect(sql).toContain('jsonb_array_elements_text(r.topics) WHERE value = ANY(ARRAY[');
        });

        it('groupBy=integration joins integrations on the r alias', async () => {
            const sql = await renderGroupBySql({groupBy: 'integration'});
            expect(sql).toContain('i.integration_id::text as group_key, i.label as group_label');
            expect(sql).toContain('i.integration_id = r.integration_id');
        });

        it('groupBy=repository with topics filter applies the repo-topics predicate', async () => {
            const sql = await renderGroupBySql({groupBy: 'repository', topics: ['x', 'y']});
            // PHASE 2 CORRECTION (intended, reviewable SQL change): previously this rendered the
            // fully-qualified "github"."repositories"."topics" against the aliased table `r`, which
            // PostgreSQL rejects. buildCteGroupBy now references the `r` alias, matching the lateral
            // join and getPRReviewTime, fixing the invalid query for groupBy=repository + topics.
            expect(sql).toContain('r.topics ?| array[');
            expect(sql).not.toContain('"github"."repositories"."topics" ?| array[');
        });

        it('groupBy=integration with topics filter applies the repo-topics predicate', async () => {
            const sql = await renderGroupBySql({groupBy: 'integration', topics: ['x', 'y']});
            // See the repository case above: same latent bug, fixed in Phase 2.
            expect(sql).toContain('r.topics ?| array[');
            expect(sql).not.toContain('"github"."repositories"."topics" ?| array[');
        });
    });

    describe('getPRReviewTime group-by SQL', () => {
        const INTEGRATION = '11111111-1111-1111-1111-111111111111';
        const renderGroupBySql = async (filter: Record<string, unknown>): Promise<string> => {
            let sqlText = '';
            (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
                const tx = {
                    execute: vi.fn().mockImplementation((query: SQL) => {
                        sqlText += renderSql(query);
                        return {rows: []};
                    }),
                };
                return params.callback(tx);
            });
            await metrics.getPRReviewTime({integrationIds: [INTEGRATION], filter: filter as any});
            return sqlText;
        };

        it('groupBy=repository selects and joins on the repo alias', async () => {
            const sql = await renderGroupBySql({groupBy: 'repository'});
            expect(sql).toContain('repo.id::text as group_key');
            expect(sql).toContain('repo.name as group_label');
            expect(sql).toContain('JOIN "github"."repositories" repo');
        });

        it('groupBy=topic uses a lateral over jsonb_array_elements_text(repo.topics)', async () => {
            const sql = await renderGroupBySql({groupBy: 'topic'});
            expect(sql).toContain('t.topic as group_key, t.topic as group_label');
            expect(sql).toContain('jsonb_array_elements_text(repo.topics)');
        });

        it('groupBy=topic with topics filter scopes the lateral with value = ANY(...)', async () => {
            const sql = await renderGroupBySql({groupBy: 'topic', topics: ['x', 'y']});
            expect(sql).toContain('jsonb_array_elements_text(repo.topics) WHERE value = ANY(ARRAY[');
        });

        it('groupBy=integration joins integrations on the fr alias', async () => {
            const sql = await renderGroupBySql({groupBy: 'integration'});
            expect(sql).toContain('i.integration_id::text as group_key, i.label as group_label');
            expect(sql).toContain('i.integration_id = fr.integration_id');
        });

        it('groupBy=repository with topics filter applies the repo-topics predicate', async () => {
            const sql = await renderGroupBySql({groupBy: 'repository', topics: ['x', 'y']});
            expect(sql).toContain('repo.topics ?| array[');
        });

        it('groupBy=integration with topics filter applies the repo-topics predicate', async () => {
            const sql = await renderGroupBySql({groupBy: 'integration', topics: ['x', 'y']});
            expect(sql).toContain('repo.topics ?| array[');
        });
    });
});
