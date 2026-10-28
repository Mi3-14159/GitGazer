import type {PGlite} from '@electric-sql/pglite';
import {PgDialect} from 'drizzle-orm/pg-core';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {db, mcpDb} from '../client';
import {mcpTenantSeparationPolicy} from '../schema/github/misc';
import {BYTE_BUDGET, runReadOnlyQuery, wrapReadOnlyQuery} from './readonlyQuery';

vi.mock('../client', async (importOriginal) => {
    const {PGlite} = await import('@electric-sql/pglite');
    // A variable specifier, because only some of the tsconfigs that check this file resolve the package's exports map.
    const pgcryptoPath = '@electric-sql/pglite/contrib/pgcrypto';
    const {pgcrypto} = (await import(pgcryptoPath)) as {pgcrypto: import('@electric-sql/pglite').Extension};
    const {drizzle} = await import('drizzle-orm/pglite');
    return {
        ...(await importOriginal<typeof import('../client')>()),
        db: drizzle({client: new PGlite({extensions: {pgcrypto}})}),
        mcpDb: drizzle({client: new PGlite({extensions: {pgcrypto}})}),
        hasSeparateMcpLogin: () => true,
    };
});

const client = (mcpDb as unknown as {$client: PGlite}).$client;
const appClient = (db as unknown as {$client: PGlite}).$client;
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const integrationRoles = {[A]: 'member' as const};

// The app and the MCP connection are separate databases here, so both get the same fixed key instead of a random one.
const migration = readFileSync(join(__dirname, '../../drizzle/20261029090000_mcp_signed_context/migration.sql'), 'utf8')
    .split('--> statement-breakpoint')
    .filter((statement) => !/^\s*(?:ALTER POLICY|DROP FUNCTION)/.test(statement))
    .join('\n')
    .replace('public.gen_random_bytes(32)', `'\\x${'ab'.repeat(32)}'::bytea`);

const setUp = async (pg: PGlite) => {
    await pg.exec(`
        CREATE EXTENSION pgcrypto;
        CREATE ROLE root SUPERUSER;
        CREATE ROLE gitgazer_mcp;
        CREATE ROLE gitgazer_reader;
        CREATE ROLE gitgazer_writer;
        SET ROLE root;
        CREATE SCHEMA github;
        CREATE SCHEMA gitgazer;
        GRANT USAGE ON SCHEMA github TO gitgazer_mcp;
    `);
    await pg.exec(migration);
    await pg.exec('RESET ROLE');
};

beforeAll(async () => {
    await setUp(client);
    await setUp(appClient);
    await client.exec(`
        CREATE TABLE github.t (integration_id uuid, v int);
        ALTER TABLE github.t ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "tenant separation mcp" ON github.t FOR SELECT TO gitgazer_mcp USING (${new PgDialect().sqlToQuery(mcpTenantSeparationPolicy().using!).sql});
        GRANT SELECT ON github.t TO gitgazer_mcp;
        INSERT INTO github.t VALUES ('${A}', 1), ('${B}', 2);
    `);
});

afterAll(async () => {
    await client.close();
    await appClient.close();
});

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

    it('returns only the rows of the integrations in the signed context', async () => {
        const result = await runReadOnlyQuery({sql: 'SELECT v FROM github.t ORDER BY v', integrationRoles: {[A]: 'member'}});
        expect(result.rows).toEqual([{v: 1}]);
    });

    it('does not flag a query that matched nothing', async () => {
        const result = await runReadOnlyQuery({sql: 'SELECT 1 AS n WHERE false', integrationRoles});
        expect(result).toEqual({columns: ['n'], rows: [], rowCount: 0, truncated: false});
    });
});
