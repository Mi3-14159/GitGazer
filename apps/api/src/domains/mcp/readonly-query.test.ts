import {type SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: vi.fn(),
}));

const dialect = new PgDialect();
const renderSql = (query: SQL): string => dialect.sqlToQuery(query).sql;

const INTEGRATION_ID = '11111111-1111-1111-1111-111111111111';

let rds: typeof import('@gitgazer/db/client');
let mod: typeof import('@gitgazer/db/queries/readonlyQuery');

describe('runReadOnlyQuery', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        rds = await import('@gitgazer/db/client');
        mod = await import('@gitgazer/db/queries/readonlyQuery');
    });

    describe('assertReadOnlySelect', () => {
        it('accepts SELECT and WITH queries and strips a trailing semicolon', () => {
            expect(mod.assertReadOnlySelect('SELECT 1')).toBe('SELECT 1');
            expect(mod.assertReadOnlySelect('  select * from workflow_runs ;  ')).toBe('select * from workflow_runs');
            expect(mod.assertReadOnlySelect('WITH x AS (SELECT 1) SELECT * FROM x')).toBe('WITH x AS (SELECT 1) SELECT * FROM x');
        });

        it('accepts a query preceded by comments', () => {
            expect(mod.assertReadOnlySelect('-- a comment\nSELECT 1')).toBe('-- a comment\nSELECT 1');
        });

        it('rejects empty queries', () => {
            expect(() => mod.assertReadOnlySelect('   ')).toThrow(mod.ReadOnlyQueryError);
        });

        it('rejects non-SELECT statements', () => {
            for (const q of [
                'UPDATE workflow_runs SET x=1',
                'INSERT INTO x VALUES (1)',
                'DELETE FROM x',
                'DROP TABLE x',
                'SET ROLE gitgazer_writer',
            ]) {
                expect(() => mod.assertReadOnlySelect(q)).toThrow(/read-only SELECT/);
            }
        });

        it('rejects blocked functions (GUC tampering / host access)', () => {
            expect(() => mod.assertReadOnlySelect("SELECT set_config('rls.integration_ids', 'other', false)")).toThrow(/blocked function/);
            expect(() => mod.assertReadOnlySelect('SELECT pg_sleep(10)')).toThrow(/blocked function/);
        });
    });

    const capture: {params?: Record<string, unknown>; execArg?: SQL} = {};
    const mockRun = (rows: Record<string, unknown>[], fields?: {name: string}[]) => {
        (rds.withRlsTransaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (params: Record<string, unknown>) => {
            capture.params = params;
            const tx = {execute: vi.fn().mockResolvedValue({rows, fields})};
            const result = await (params.callback as (tx: unknown) => Promise<unknown>)(tx);
            capture.execArg = tx.execute.mock.calls[0][0] as SQL;
            return result;
        });
    };

    it('runs under the analyst role, read-only, with a statement timeout', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationIds: [INTEGRATION_ID], statementTimeoutS: 7});

        expect(capture.params?.userName).toBe('gitgazer_mcp');
        expect(capture.params?.readOnly).toBe(true);
        expect(capture.params?.statementTimeoutS).toBe(7);
        expect(capture.params?.integrationIds).toEqual([INTEGRATION_ID]);
    });

    it('wraps the user SQL in a subquery with a row-cap+1 LIMIT', async () => {
        mockRun([{a: 1}]);
        await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationIds: [INTEGRATION_ID], rowCap: 500});

        const rendered = renderSql(capture.execArg as SQL);
        expect(rendered).toContain('SELECT * FROM (');
        expect(rendered).toContain(') AS _mcp LIMIT 501');
        expect(rendered).toContain('SELECT 1 AS a');
    });

    it('flags truncation and caps the returned rows at rowCap', async () => {
        // rowCap 2 → LIMIT 3 → 3 rows returned means "more exist".
        mockRun([{n: 1}, {n: 2}, {n: 3}], [{name: 'n'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT n FROM t', integrationIds: [INTEGRATION_ID], rowCap: 2});

        expect(result.truncated).toBe(true);
        expect(result.rowCount).toBe(2);
        expect(result.rows).toHaveLength(2);
        expect(result.columns).toEqual(['n']);
    });

    it('does not flag truncation when rows fit within rowCap', async () => {
        mockRun([{n: 1}], [{name: 'n'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT n FROM t', integrationIds: [INTEGRATION_ID], rowCap: 2});
        expect(result.truncated).toBe(false);
        expect(result.rowCount).toBe(1);
    });

    it('derives columns from the first row when field metadata is absent', async () => {
        mockRun([{x: 1, y: 2}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT x, y FROM t', integrationIds: [INTEGRATION_ID]});
        expect(result.columns).toEqual(['x', 'y']);
    });

    it('rejects an invalid rowCap before touching the database', async () => {
        mockRun([]);
        await expect(mod.runReadOnlyQuery({sql: 'SELECT 1', integrationIds: [INTEGRATION_ID], rowCap: 0})).rejects.toThrow(/rowCap/);
        expect(rds.withRlsTransaction).not.toHaveBeenCalled();
    });

    it('rejects a non-SELECT query before touching the database', async () => {
        mockRun([]);
        await expect(mod.runReadOnlyQuery({sql: 'DELETE FROM workflow_runs', integrationIds: [INTEGRATION_ID]})).rejects.toThrow(/read-only SELECT/);
        expect(rds.withRlsTransaction).not.toHaveBeenCalled();
    });
});
