import {PgDialect} from 'drizzle-orm/pg-core';
import type {SQL} from 'drizzle-orm';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({Pool: vi.fn(), Signer: vi.fn(), end: vi.fn()}));

vi.mock('pg', () => ({
    default: {
        Pool: class {
            end = mocks.end;
            constructor(options: unknown) {
                mocks.Pool(options);
            }
        },
    },
}));
vi.mock('@aws-sdk/rds-signer', () => ({
    Signer: class {
        constructor(options: unknown) {
            mocks.Signer(options);
        }
    },
}));
vi.mock('drizzle-orm/node-postgres', () => ({drizzle: () => ({})}));
vi.mock('drizzle-orm/aws-data-api/pg', () => ({drizzle: () => ({})}));
vi.mock('@aws-sdk/client-rds-data', () => ({RDSDataClient: class {}}));

const loadClient = async () => {
    vi.resetModules();
    return await import('./client');
};

describe('db client', () => {
    beforeEach(() => {
        vi.stubEnv('RDS_HOST', 'proxy.example.com');
        vi.stubEnv('RDS_DATABASE', 'gitgazer');
        vi.stubEnv('RDS_DB_USER', 'gitgazer_app');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('sizes the pool from DB_POOL_MAX', async () => {
        vi.stubEnv('DB_POOL_MAX', '10');
        await (await loadClient()).initDb();
        vi.stubEnv('DB_POOL_MAX', undefined);
        await (await loadClient()).initDb();

        expect(mocks.Pool).toHaveBeenNthCalledWith(1, expect.objectContaining({user: 'gitgazer_app', max: 10, connectionTimeoutMillis: 5000}));
        expect(mocks.Pool).toHaveBeenNthCalledWith(3, expect.objectContaining({user: 'gitgazer_app', max: 1, connectionTimeoutMillis: 5000}));
    });

    it('opens a separate pool that logs in as gitgazer_mcp with its own IAM token', async () => {
        await (await loadClient()).initDb();

        expect(mocks.Pool).toHaveBeenCalledTimes(2);
        expect(mocks.Pool).toHaveBeenNthCalledWith(2, expect.objectContaining({user: 'gitgazer_mcp', max: 2, database: 'gitgazer'}));
        expect(mocks.Signer).toHaveBeenNthCalledWith(2, expect.objectContaining({username: 'gitgazer_mcp'}));
    });

    it('rejects a DB_POOL_MAX that is not a positive integer', async () => {
        vi.stubEnv('DB_POOL_MAX', 'ten');

        await expect((await loadClient()).initDb()).rejects.toThrow('Invalid DB_POOL_MAX: ten');
    });

    it('reports a separate mcp login only after initDb() in rds-proxy mode', async () => {
        const client = await loadClient();
        const {runReadOnlyQuery} = await import('./queries/readonlyQuery');
        await expect(runReadOnlyQuery({sql: 'SELECT 1', integrationRoles: {}})).rejects.toThrow('Database not initialized');

        await client.initDb();

        expect(client.hasSeparateMcpLogin()).toBe(true);
    });

    it('reports no separate mcp login in data-api mode', async () => {
        vi.stubEnv('DB_CONNECTION_MODE', 'data-api');
        vi.stubEnv('RDS_RESOURCE_ARN', 'arn');
        vi.stubEnv('RDS_SECRET_ARN', 'arn');
        const client = await loadClient();

        await client.initDb();

        expect(client.hasSeparateMcpLogin()).toBe(false);
    });

    it('ends both pools on close', async () => {
        const client = await loadClient();
        await client.initDb();

        await client.closeDb();

        expect(mocks.end).toHaveBeenCalledTimes(2);
    });
});

describe('withRlsTransaction with integrationRoles', () => {
    const A = '11111111-1111-1111-1111-111111111111';
    const SIGNATURE = 'ab'.repeat(32);

    const fakeClient = (signature: unknown = SIGNATURE) => {
        const executed: {sql: string; params: unknown[]}[] = [];
        const tx = {
            execute: vi.fn(async (query: SQL) => {
                const rendered = new PgDialect().sqlToQuery(query);
                executed.push(rendered);
                if (rendered.sql.includes('pg_backend_pid')) return {rows: [{pid: 4242, txn_start_us: '1793000000123456'}]};
                if (rendered.sql.includes('sign_context')) return {rows: [{signature}]};
                return {rows: []};
            }),
        };
        const transaction = vi.fn(async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx));
        return {executed, client: {transaction} as never, transaction};
    };

    it('signs the context on the transaction itself, before it switches to the role', async () => {
        const {withRlsTransaction} = await loadClient();
        const {executed, client} = fakeClient();

        await withRlsTransaction({integrationIds: [A], integrationRoles: {[A]: 'admin'}, client, callback: async () => undefined});

        expect(executed.slice(0, 4)).toEqual([
            {sql: 'SELECT pg_backend_pid() AS pid, (extract(epoch FROM now()) * 1000000)::bigint::text AS txn_start_us', params: []},
            {
                sql: 'SELECT gitgazer_internal.sign_context($1, $2::integer, $3::bigint) AS signature',
                params: [`${A}:admin`, 4242, '1793000000123456'],
            },
            {sql: `SET LOCAL rls.signed_context = '${A}:admin|${SIGNATURE}';`, params: []},
            {sql: 'SET LOCAL ROLE "gitgazer_reader";', params: []},
        ]);
        expect(executed.map((query) => query.sql)).toContain(`SET LOCAL rls.integration_ids = '${A}';`);
    });

    it('does not sign without integrationRoles', async () => {
        const {withRlsTransaction} = await loadClient();
        const {executed, client} = fakeClient();

        await withRlsTransaction({integrationIds: [A], client, callback: async () => undefined});

        expect(executed.map((query) => query.sql).filter((text) => /sign|pg_backend_pid/.test(text))).toEqual([]);
    });

    it('rejects an invalid role before opening the transaction', async () => {
        const {withRlsTransaction} = await loadClient();
        const {client, transaction} = fakeClient();

        await expect(
            withRlsTransaction({integrationIds: [A], integrationRoles: {[A]: 'root' as never}, client, callback: async () => undefined}),
        ).rejects.toThrow('Invalid integration role');
        expect(transaction).not.toHaveBeenCalled();
    });

    it('never runs the callback when the signature is invalid', async () => {
        const {withRlsTransaction} = await loadClient();
        const {client} = fakeClient("x'; RESET ROLE; --");
        const callback = vi.fn();

        await expect(withRlsTransaction({integrationIds: [A], integrationRoles: {[A]: 'admin'}, client, callback})).rejects.toThrow(
            /invalid signature/,
        );
        expect(callback).not.toHaveBeenCalled();
    });
});
