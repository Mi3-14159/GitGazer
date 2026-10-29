import {TransactionRollbackError, type SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeEach, describe, expect, it, vi, type Mock} from 'vitest';

vi.mock('@gitgazer/db/client', async (importOriginal) => ({
    INTEGRATION_ID_PATTERN: (await importOriginal<typeof import('@gitgazer/db/client')>()).INTEGRATION_ID_PATTERN,
    withRlsTransaction: vi.fn(),
    mcpDb: {name: 'mcp connection'},
    db: {execute: vi.fn()},
    hasSeparateMcpLogin: vi.fn(() => true),
}));

const dialect = new PgDialect();

const INTEGRATION_ID = '11111111-1111-1111-1111-111111111111';
const PID = 4242;
const TXN_START_US = '1793000000123456';
const SIGNATURE = 'ab'.repeat(32);

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

        it('rejects blocked statements + functions (GUC tampering / host access / cross-tenant leak)', () => {
            expect(() => mod.assertReadOnlySelect("SELECT set_config('rls.integration_ids', 'other', false)")).toThrow(/blocked/);
            expect(() => mod.assertReadOnlySelect('SELECT pg_sleep(10)')).toThrow(/blocked/);
            // pg_stat_activity (view) AND its underlying pg_stat_get_activity() function leak other
            // tenants' in-flight query text + integration UUIDs under the shared gitgazer_mcp role.
            expect(() => mod.assertReadOnlySelect('SELECT query FROM pg_stat_activity')).toThrow(/blocked/);
            expect(() => mod.assertReadOnlySelect('SELECT query FROM pg_stat_get_activity(NULL)')).toThrow(/blocked/);
            // Quoting the identifier does NOT evade the blocklist (the word boundary still matches).
            expect(() => mod.assertReadOnlySelect(`SELECT "set_config"('rls.integration_ids', 'other', true)`)).toThrow(/blocked/);
        });

        it('rejects functions that run a caller-supplied SQL string (a concatenated set_config would evade the blocklist)', () => {
            const id = '11111111-1111-1111-1111-111111111111';
            for (const q of [
                `SELECT query_to_xml('select set_con'||'fig(''rls.integration_roles'','''||'${id}'||':owner'',true)', true, false, '') AS a, query_to_xml('select * from github.t', true, false, '') AS b`,
                `SELECT (SELECT count(*) FROM ts_stat('select to_tsvector(set_con'||'fig(''rls.integration_roles'',''x:owner'',true))')) AS n`,
                `SELECT pg_catalog.query_to_xml('select 1', true, false, '')`,
                `SELECT query_to_xmlschema('select 1', true, false, '')`,
                `SELECT query_to_xml_and_xmlschema('select 1', true, false, '')`,
                `SELECT ts_rewrite(to_tsquery('a'), 'select to_tsquery(''a''), to_tsquery(''b'')')`,
            ]) {
                expect(() => mod.assertReadOnlySelect(q)).toThrow(/blocked/);
            }
        });

        it.each([
            ['the *_to_xml family', `SELECT table_to_xml('github.workflow_runs', true, false, '')`],
            ['dblink', `SELECT * FROM dblink_connect('host=x')`],
            ['pg_sleep variants', `SELECT pg_sleep_for('1 second')`],
            ['session advisory locks', 'SELECT pg_advisory_lock(1)'],
            ['try advisory locks', 'SELECT pg_try_advisory_xact_lock(1)'],
            ['large objects', 'SELECT lo_get(1)'],
            ['loread', 'SELECT loread(0, 1)'],
            ['pg_ls_*', 'SELECT * FROM pg_ls_waldir()'],
            ['pg_settings', 'SELECT * FROM pg_settings'],
        ])('rejects %s', (_family, q) => {
            expect(() => mod.assertReadOnlySelect(q)).toThrow(/blocked/);
        });

        it('rejects bind-parameter placeholders, which would bind to the wrap parameters', () => {
            expect(() => mod.assertReadOnlySelect('SELECT $1')).toThrow(/placeholders/);
            expect(() => mod.assertReadOnlySelect('SELECT * FROM t WHERE a = $2')).toThrow(/placeholders/);
        });

        it('rejects a nested block comment in the leading comments (Postgres nests them, the regex does not)', () => {
            expect(() => mod.assertReadOnlySelect('/* /* */ SELECT 1 */ DELETE FROM x')).toThrow(/nested block comments/);
        });

        it('rejects statement stacking that would break out of the subquery wrap (cross-tenant read)', () => {
            // Postgres already refuses these for the bound wrap; the text check is defence in depth.
            expect(() => mod.assertReadOnlySelect('SELECT 1; SELECT 2')).toThrow(/single statement/);
            // The real exploit: break out of `SELECT * FROM (<sql>) _mcp`, flip the RLS GUC, re-select.
            const breakout = `SELECT 1) x; SET rls.integration_ids='00000000-0000-0000-0000-000000000000'; SELECT * FROM (SELECT * FROM github.workflow_runs`;
            expect(() => mod.assertReadOnlySelect(breakout)).toThrow(/single statement/);
        });

        it('rejects Unicode-escaped identifiers that smuggle a blocked function past the blocklist', () => {
            // U&"\0073et_config" parses as the identifier `set_config`, but the raw text never
            // contains the literal token, which the previous regex-only guard missed.
            const escaped = `WITH x AS MATERIALIZED (SELECT U&"\\0073et_config"('rls.integration_ids', 'other', true)) SELECT * FROM workflow_runs`;
            expect(() => mod.assertReadOnlySelect(escaped)).toThrow(/Unicode-escape/);
        });
    });

    const capture: {params?: Record<string, unknown>; execArgs: SQL[]; rollback?: ReturnType<typeof vi.fn>} = {execArgs: []};
    // Rows get the wrap's bookkeeping columns like the database adds them; a row may override them.
    const mockRun = (rows: Record<string, unknown>[], fields?: {name: string}[]) => {
        capture.execArgs = [];
        (rds.withRlsTransaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (params: Record<string, unknown>) => {
            capture.params = params;
            const tx = {
                execute: vi.fn(async (query: SQL) => {
                    capture.execArgs.push(query);
                    if (dialect.sqlToQuery(query).sql.includes('pg_backend_pid')) {
                        return {rows: [{pid: PID, txn_start_us: TXN_START_US}]};
                    }
                    return {
                        rows: rows.map((row) => ({_mcp_bytes: 0, _mcp_more: null, _mcp_any: true, ...row})),
                        fields: fields && [...fields, {name: '_mcp_bytes'}, {name: '_mcp_more'}, {name: '_mcp_any'}],
                    };
                }),
                rollback: vi.fn(() => {
                    throw new TransactionRollbackError();
                }),
            };
            capture.rollback = tx.rollback;
            return await (params.callback as (tx: unknown) => Promise<unknown>)(tx);
        });
        signExecute().mockResolvedValue({rows: [{signature: SIGNATURE}]});
    };
    const signExecute = () => rds.db.execute as unknown as Mock;
    const executedSql = () => capture.execArgs.map((query) => dialect.sqlToQuery(query).sql);

    it('runs on the gitgazer_mcp login under the mcp role, read-only, with statement and lock timeouts', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {[INTEGRATION_ID]: 'member'}, statementTimeoutS: 7});

        expect(capture.params?.client).toBe(rds.mcpDb);
        expect(capture.params?.userName).toBe('gitgazer_mcp');
        expect(capture.params?.readOnly).toBe(true);
        expect(capture.params?.statementTimeoutS).toBe(7);
        expect(capture.params?.lockTimeoutS).toBe(2);
        expect(capture.params?.integrationIds).toEqual([]);
        expect(capture.params).not.toHaveProperty('integrationRoles');
    });

    it('signs the context on the app connection for the session and transaction of the query', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {[INTEGRATION_ID]: 'member'}});

        expect(executedSql()[0]).toBe('SELECT pg_backend_pid() AS pid, (extract(epoch FROM now()) * 1000000)::bigint::text AS txn_start_us');
        expect(signExecute()).toHaveBeenCalledOnce();
        const {sql: rendered, params} = dialect.sqlToQuery(signExecute().mock.calls[0][0]);
        expect(rendered).toBe('SELECT gitgazer.sign_context($1, $2::integer, $3::bigint) AS signature');
        expect(params).toEqual([`${INTEGRATION_ID}:member`, PID, TXN_START_US]);
    });

    it('sets the signed context before the wrapped query', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {[INTEGRATION_ID]: 'member'}});

        const executed = executedSql();
        expect(executed).toHaveLength(3);
        expect(executed[1]).toBe(`SET LOCAL rls.signed_context = '${INTEGRATION_ID}:member|${SIGNATURE}';`);
        expect(executed[2]).toMatch(/^WITH _mcp AS MATERIALIZED/);
    });

    it('lowercases the integration ids in the signed payload', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {'AAAAAAAA-1111-1111-1111-111111111111': 'admin'}});

        expect(dialect.sqlToQuery(signExecute().mock.calls[0][0]).params[0]).toBe('aaaaaaaa-1111-1111-1111-111111111111:admin');
    });

    it('signs an empty payload for a caller without integrations and still runs the query', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {}});

        expect(dialect.sqlToQuery(signExecute().mock.calls[0][0]).params[0]).toBe('');
        expect(executedSql()[1]).toBe(`SET LOCAL rls.signed_context = '|${SIGNATURE}';`);
        expect(executedSql()[2]).toMatch(/^WITH _mcp AS MATERIALIZED/);
    });

    it('never runs the query when signing fails', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        const boom = new Error('sign failed');
        signExecute().mockRejectedValue(boom);

        const error = await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {[INTEGRATION_ID]: 'member'}}).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(mod.McpContextError);
        expect((error as {cause?: unknown}).cause).toBe(boom);
        expect(executedSql()).toHaveLength(1);
    });

    it('does not report a signing failure from Postgres as an error in the caller query', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        const pgError = Object.assign(new Error('function gitgazer.sign_context(unknown, integer, bigint) does not exist'), {code: '42883'});
        signExecute().mockRejectedValue(Object.assign(new Error('Failed query: SELECT gitgazer.sign_context(…)'), {cause: pgError}));

        const error = await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {[INTEGRATION_ID]: 'member'}}).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(mod.McpContextError);
        expect(error).not.toBeInstanceOf(mod.ReadOnlyQueryError);
    });

    it('rejects a signature that is not 64 hex characters before setting the context', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        signExecute().mockResolvedValue({rows: [{signature: "x'; RESET ROLE; --"}]});

        await expect(mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {[INTEGRATION_ID]: 'member'}})).rejects.toThrow(/signature/);
        expect(executedSql()).toHaveLength(1);
    });

    it('rejects an invalid integration id or role before touching the database', async () => {
        mockRun([]);
        await expect(mod.runReadOnlyQuery({sql: 'SELECT 1', integrationRoles: {"x'; RESET ROLE; --": 'admin'}})).rejects.toThrow(
            /Invalid integration ID/,
        );
        await expect(mod.runReadOnlyQuery({sql: 'SELECT 1', integrationRoles: {[INTEGRATION_ID]: 'superuser' as never}})).rejects.toThrow(
            /Invalid integration role/,
        );
        expect(rds.withRlsTransaction).not.toHaveBeenCalled();
    });

    it('refuses to run in Data API mode, where there is no separate mcp login', async () => {
        mockRun([]);
        (rds.hasSeparateMcpLogin as unknown as Mock).mockReturnValueOnce(false);

        const error = await mod.runReadOnlyQuery({sql: 'SELECT 1', integrationRoles: {[INTEGRATION_ID]: 'member'}}).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(mod.ReadOnlyQueryError);
        expect((error as Error).message).toBe(
            'MCP queries are not available in Data API mode: they need the separate gitgazer_mcp login (DB_CONNECTION_MODE=rds-proxy).',
        );
        expect(rds.withRlsTransaction).not.toHaveBeenCalled();
    });

    it('rolls the transaction back and still returns the result', async () => {
        mockRun([{a: 1}], [{name: 'a'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {[INTEGRATION_ID]: 'member'}});

        expect(capture.rollback).toHaveBeenCalledTimes(1);
        expect(result).toEqual({columns: ['a'], rows: [{a: 1}], rowCount: 1, truncated: false});
    });

    it('caps the user SQL at row-cap+1 inside the byte-budget window, both bound as parameters (extended query protocol)', async () => {
        mockRun([{a: 1}]);
        await mod.runReadOnlyQuery({sql: 'SELECT 1 AS a', integrationRoles: {[INTEGRATION_ID]: 'member'}, rowCap: 500});

        expect(capture.execArgs).toHaveLength(3);
        const {sql: rendered, params} = dialect.sqlToQuery(capture.execArgs[2]);
        // The LIMIT must sit inside the window, or Postgres reads the whole input to evaluate the budget filter.
        expect(rendered).toMatch(/^WITH _mcp AS MATERIALIZED \(SELECT \* FROM \(\nSELECT 1 AS a\n\) AS _mcp_inner LIMIT \$1\) /);
        expect(rendered).toContain('sum(octet_length((_mcp.*)::text))');
        expect(rendered).toMatch(/ON _mcp_bytes <= \$2$/);
        expect(params).toEqual([501, 128 * 1024]);
    });

    it('flags an empty result as truncated when the byte budget dropped the first row', async () => {
        // No row fits the budget: the LEFT JOIN returns one NULL sentinel row carrying `_mcp_any`.
        mockRun([{s: null, _mcp_bytes: null, _mcp_any: true}], [{name: 's'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT s FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}});

        expect(result).toEqual({columns: ['s'], rows: [], rowCount: 0, truncated: true});
        expect(capture.execArgs).toHaveLength(3);
    });

    it('does not flag a genuinely empty result', async () => {
        mockRun([{s: null, _mcp_bytes: null, _mcp_any: false}], [{name: 's'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT s FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}});

        expect(result).toEqual({columns: ['s'], rows: [], rowCount: 0, truncated: false});
    });

    it('never returns the bookkeeping columns', async () => {
        mockRun([{a: 1}, {a: 2}], [{name: 'a'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT a FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}});

        expect(result.columns).toEqual(['a']);
        expect(result.rows).toEqual([{a: 1}, {a: 2}]);
    });

    it('flags truncation when the database dropped the following rows for the byte budget', async () => {
        // A non-null look-ahead on the last row means a row followed it but did not pass the budget filter.
        mockRun([{a: 1}, {a: 2, _mcp_more: 1}], [{name: 'a'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT a FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}});

        expect(result.truncated).toBe(true);
        expect(result.rows).toEqual([{a: 1}, {a: 2}]);
    });

    it('stops at the byte budget in the returned rows', async () => {
        const big = 'x'.repeat(20_000);
        mockRun(
            Array.from({length: 50}, () => ({s: big})),
            [{name: 's'}],
        );
        const result = await mod.runReadOnlyQuery({sql: 'SELECT s FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}});

        expect(result.truncated).toBe(true);
        expect(result.rowCount).toBe(result.rows.length);
        expect(result.rowCount).toBeLessThan(50);
        expect(Buffer.byteLength(JSON.stringify(result.rows))).toBeLessThanOrEqual(128 * 1024);
    });

    it('drops and flags a single row larger than the byte budget', async () => {
        mockRun([{s: 'y'.repeat(128 * 1024 * 2)}], [{name: 's'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT s FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}});

        expect(result).toEqual({columns: ['s'], rows: [], rowCount: 0, truncated: true});
    });

    it('flags truncation and caps the returned rows at rowCap', async () => {
        // rowCap 2 → LIMIT 3 → 3 rows returned means "more exist".
        mockRun([{n: 1}, {n: 2}, {n: 3}], [{name: 'n'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT n FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}, rowCap: 2});

        expect(result.truncated).toBe(true);
        expect(result.rowCount).toBe(2);
        expect(result.rows).toHaveLength(2);
        expect(result.columns).toEqual(['n']);
    });

    it('does not flag truncation when rows fit within rowCap', async () => {
        mockRun([{n: 1}], [{name: 'n'}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT n FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}, rowCap: 2});
        expect(result.truncated).toBe(false);
        expect(result.rowCount).toBe(1);
    });

    it('derives columns from the first row when field metadata is absent', async () => {
        mockRun([{x: 1, y: 2}]);
        const result = await mod.runReadOnlyQuery({sql: 'SELECT x, y FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}});
        expect(result.columns).toEqual(['x', 'y']);
    });

    it('rejects an invalid rowCap before touching the database', async () => {
        mockRun([]);
        await expect(mod.runReadOnlyQuery({sql: 'SELECT 1', integrationRoles: {[INTEGRATION_ID]: 'member'}, rowCap: 0})).rejects.toThrow(/rowCap/);
        expect(rds.withRlsTransaction).not.toHaveBeenCalled();
    });

    it('rejects a non-SELECT query before touching the database', async () => {
        mockRun([]);
        await expect(mod.runReadOnlyQuery({sql: 'DELETE FROM workflow_runs', integrationRoles: {[INTEGRATION_ID]: 'member'}})).rejects.toThrow(
            /read-only SELECT/,
        );
        expect(rds.withRlsTransaction).not.toHaveBeenCalled();
    });

    it('rethrows a Postgres statement-timeout cancellation as an actionable ReadOnlyQueryError', async () => {
        // drizzle re-wraps the node-postgres driver error (SQLSTATE 57014) as the `cause` of a
        // "Failed query: …" Error; the raw query text must not leak to the client.
        const pgError = Object.assign(new Error('canceling statement due to statement timeout'), {code: '57014'});
        const wrapped = Object.assign(new Error('Failed query: SELECT * FROM (…)'), {cause: pgError});
        (rds.withRlsTransaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(wrapped);

        const error = await mod
            .runReadOnlyQuery({sql: 'SELECT 1', integrationRoles: {[INTEGRATION_ID]: 'member'}, statementTimeoutS: 10})
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(mod.ReadOnlyQueryError);
        expect((error as Error).message).toMatch(/exceeded the 10s statement timeout/);
        expect((error as Error).message).not.toContain('Failed query');
    });

    it('surfaces a syntax error (SQLSTATE 42601) with the Postgres primary message', async () => {
        // Input passes assertReadOnlySelect (starts with SELECT); the syntax error is only raised by Postgres.
        const pgError = Object.assign(new Error('syntax error at or near "FRM"'), {code: '42601'});
        const wrapped = Object.assign(new Error('Failed query: SELECT 1 FRM t'), {cause: pgError});
        (rds.withRlsTransaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(wrapped);

        const error = await mod.runReadOnlyQuery({sql: 'SELECT 1 FRM t', integrationRoles: {[INTEGRATION_ID]: 'member'}}).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(mod.ReadOnlyQueryError);
        expect((error as Error).message).toBe('Query failed: syntax error at or near "FRM"');
        // The drizzle wrapper's "Failed query: <sql>" text must never reach the client.
        expect((error as Error).message).not.toContain('Failed query');
    });

    it('surfaces an undefined-column error (SQLSTATE 42703) so the caller can self-correct', async () => {
        const pgError = Object.assign(new Error('column "athor" does not exist'), {code: '42703'});
        (rds.withRlsTransaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
            Object.assign(new Error('Failed query: …'), {cause: pgError}),
        );

        const error = await mod
            .runReadOnlyQuery({sql: 'SELECT athor FROM t', integrationRoles: {[INTEGRATION_ID]: 'member'}})
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(mod.ReadOnlyQueryError);
        expect((error as Error).message).toBe('Query failed: column "athor" does not exist');
    });

    it('surfaces a data exception (SQLSTATE 22P02, invalid input) with the primary message', async () => {
        const pgError = Object.assign(new Error('invalid input syntax for type uuid: "nope"'), {code: '22P02'});
        (rds.withRlsTransaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
            Object.assign(new Error('Failed query: …'), {cause: pgError}),
        );

        const error = await mod
            .runReadOnlyQuery({sql: "SELECT 'nope'::uuid", integrationRoles: {[INTEGRATION_ID]: 'member'}})
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(mod.ReadOnlyQueryError);
        expect((error as Error).message).toBe('Query failed: invalid input syntax for type uuid: "nope"');
    });

    it('surfaces a read-only-transaction violation (SQLSTATE 25006) from a smuggled write', async () => {
        const pgError = Object.assign(new Error('cannot execute INSERT in a read-only transaction'), {code: '25006'});
        (rds.withRlsTransaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
            Object.assign(new Error('Failed query: …'), {cause: pgError}),
        );

        const error = await mod
            .runReadOnlyQuery({
                sql: 'WITH x AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM x',
                integrationRoles: {[INTEGRATION_ID]: 'member'},
            })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(mod.ReadOnlyQueryError);
        expect((error as Error).message).toBe('Query failed: cannot execute INSERT in a read-only transaction');
    });

    it('reports insufficient privilege (SQLSTATE 42501) without the object name or the query', async () => {
        const pgError = Object.assign(new Error('permission denied for table secrets'), {code: '42501'});
        const wrapped = Object.assign(new Error('Failed query: SELECT * FROM secrets'), {cause: pgError});
        (rds.withRlsTransaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(wrapped);

        const error = await mod.runReadOnlyQuery({sql: 'SELECT 1', integrationRoles: {[INTEGRATION_ID]: 'member'}}).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(mod.ReadOnlyQueryError);
        expect((error as Error).message).toBe('Query failed: permission denied. Only the tables listed by list_tables can be read.');
    });

    it('passes a driver error with no SQLSTATE through unchanged', async () => {
        const boom = new Error('connection reset by peer');
        (rds.withRlsTransaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(boom);
        await expect(mod.runReadOnlyQuery({sql: 'SELECT 1', integrationRoles: {[INTEGRATION_ID]: 'member'}})).rejects.toBe(boom);
    });
});
