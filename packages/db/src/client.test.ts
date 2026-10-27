import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({Pool: vi.fn(), end: vi.fn()}));

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
vi.mock('@aws-sdk/rds-signer', () => ({Signer: class {}}));
vi.mock('drizzle-orm/node-postgres', () => ({drizzle: () => ({})}));

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

        expect(mocks.Pool).toHaveBeenNthCalledWith(1, expect.objectContaining({max: 10, connectionTimeoutMillis: 5000}));
        expect(mocks.Pool).toHaveBeenNthCalledWith(2, expect.objectContaining({max: 1, connectionTimeoutMillis: 5000}));
    });

    it('rejects a DB_POOL_MAX that is not a positive integer', async () => {
        vi.stubEnv('DB_POOL_MAX', 'ten');

        await expect((await loadClient()).initDb()).rejects.toThrow('Invalid DB_POOL_MAX: ten');
    });

    it('ends the pool on close', async () => {
        const client = await loadClient();
        await client.initDb();

        await client.closeDb();

        expect(mocks.end).toHaveBeenCalledOnce();
    });
});
