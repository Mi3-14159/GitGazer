import type {PGlite} from '@electric-sql/pglite';
import {PgDialect} from 'drizzle-orm/pg-core';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {mcpDb} from '../client';
import {BYTE_BUDGET, runReadOnlyQuery, wrapReadOnlyQuery} from './readonlyQuery';

vi.mock('../client', async (importOriginal) => {
    const {PGlite} = await import('@electric-sql/pglite');
    const {drizzle} = await import('drizzle-orm/pglite');
    return {...(await importOriginal<typeof import('../client')>()), mcpDb: drizzle({client: new PGlite()})};
});

const client = (mcpDb as unknown as {$client: PGlite}).$client;
const integrationRoles = {'11111111-1111-1111-1111-111111111111': 'member' as const};

beforeAll(async () => {
    await client.exec('CREATE ROLE gitgazer_mcp');
});

afterAll(() => client.close());

// PGlite.query() always speaks the extended protocol and PGlite.exec() the simple one, so these tests show what
// Postgres does with the wrapped query in each protocol, not which one node-postgres picks.
describe('wrapReadOnlyQuery against Postgres', () => {
    // Closes the wrap's CTE, then reopens it, so every statement is valid SQL on its own.
    const stacked = 'SELECT 1 AS a) AS _mcp_inner LIMIT 1) SELECT 1; SELECT 2; WITH _mcp AS (SELECT * FROM (SELECT 1 AS a';

    it('is refused by Postgres when a statement is stacked into it', async () => {
        const error = await mcpDb.execute(wrapReadOnlyQuery(stacked, 10)).catch((e: unknown) => e);
        expect((error as {cause?: unknown}).cause).toMatchObject({
            message: expect.stringMatching(/cannot insert multiple commands into a prepared statement/),
        });
    });

    it('would run the stacked statements over the simple protocol', async () => {
        const text = new PgDialect().sqlToQuery(wrapReadOnlyQuery(stacked, 10)).sql;
        const results = await client.exec(text.replace('$1', '11').replace('$2', String(BYTE_BUDGET)));
        expect(results).toHaveLength(3);
    });
});

describe('runReadOnlyQuery against Postgres', () => {
    it('returns a small result whole', async () => {
        const result = await runReadOnlyQuery({sql: 'SELECT n FROM generate_series(1, 3) AS n', integrationRoles});
        expect(result).toEqual({columns: ['n'], rows: [{n: 1}, {n: 2}, {n: 3}], rowCount: 3, truncated: false});
    });

    it('stops at the byte budget inside the query and flags the truncation', async () => {
        const result = await runReadOnlyQuery({sql: "SELECT repeat('x', 50000) AS s FROM generate_series(1, 5)", integrationRoles});
        expect(result.columns).toEqual(['s']);
        expect(result.rowCount).toBe(2);
        expect(result.truncated).toBe(true);
        expect(Object.keys(result.rows[0])).toEqual(['s']);
    });

    it('flags truncation at the row cap', async () => {
        const result = await runReadOnlyQuery({sql: 'SELECT n FROM generate_series(1, 5) AS n', integrationRoles, rowCap: 2});
        expect(result).toEqual({columns: ['n'], rows: [{n: 1}, {n: 2}], rowCount: 2, truncated: true});
    });

    it('flags a first row larger than the byte budget instead of reporting an empty result', async () => {
        const result = await runReadOnlyQuery({sql: "SELECT repeat('x', 200000) AS s", integrationRoles});
        expect(result).toEqual({columns: ['s'], rows: [], rowCount: 0, truncated: true});
    });

    it('measures the whole row in the database even when the caller names a column _mcp', async () => {
        const wrapped = wrapReadOnlyQuery("SELECT 1 AS _mcp, repeat('x', 300000) AS big FROM generate_series(1, 3)", 10);
        const {rows} = (await mcpDb.execute(wrapped)) as unknown as {rows: {big: string | null}[]};
        expect(rows.every((row) => row.big === null)).toBe(true);
    });

    it('keeps the caller order, WITH queries and duplicate column names as before', async () => {
        const ordered = await runReadOnlyQuery({sql: 'SELECT n FROM generate_series(1, 5) AS n ORDER BY n DESC', integrationRoles, rowCap: 2});
        expect(ordered).toEqual({columns: ['n'], rows: [{n: 5}, {n: 4}], rowCount: 2, truncated: true});
        const withQuery = await runReadOnlyQuery({sql: 'WITH x AS (SELECT 7 AS v) SELECT v FROM x', integrationRoles});
        expect(withQuery).toEqual({columns: ['v'], rows: [{v: 7}], rowCount: 1, truncated: false});
        const duplicate = await runReadOnlyQuery({sql: 'SELECT 1 AS a, 2 AS a', integrationRoles});
        expect(duplicate).toEqual({columns: ['a', 'a'], rows: [{a: 2}], rowCount: 1, truncated: false});
    });

    it('still refuses a data-modifying CTE, which is only legal at top level', async () => {
        await client.exec('CREATE TABLE IF NOT EXISTS mcp_probe (n int)');
        const error = await runReadOnlyQuery({sql: 'WITH x AS (DELETE FROM mcp_probe RETURNING *) SELECT * FROM x', integrationRoles}).catch(
            (e: unknown) => e,
        );
        expect((error as {cause?: unknown}).cause).toMatchObject({message: expect.stringMatching(/must be at the top level/)});
    });

    it('does not flag a query that matched nothing', async () => {
        const result = await runReadOnlyQuery({sql: 'SELECT 1 AS n WHERE false', integrationRoles});
        expect(result).toEqual({columns: ['n'], rows: [], rowCount: 0, truncated: false});
    });
});
