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
        expect(client.hasSeparateMcpLogin()).toBe(false);

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
