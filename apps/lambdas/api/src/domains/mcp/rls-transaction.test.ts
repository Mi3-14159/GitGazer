import {initDb, withRlsTransaction} from '@gitgazer/db/client';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';

const {transaction, execute} = vi.hoisted(() => ({transaction: vi.fn(), execute: vi.fn()}));

vi.mock('drizzle-orm/aws-data-api/pg', () => ({drizzle: () => ({transaction})}));
vi.mock('@aws-sdk/client-rds-data', () => ({RDSDataClient: class {}}));

const ID_A = '11111111-1111-1111-1111-111111111111';
const noop = async (): Promise<void> => undefined;

const dialect = new PgDialect();
const executedSql = (): string[] => execute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql);

describe('withRlsTransaction', () => {
    beforeAll(async () => {
        process.env['DB_CONNECTION_MODE'] = 'data-api';
        process.env['RDS_DATABASE'] = 'db';
        process.env['RDS_RESOURCE_ARN'] = 'arn';
        process.env['RDS_SECRET_ARN'] = 'arn';
        await initDb();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({execute}));
    });

    it('rejects a non-positive or non-integer statementTimeoutS', async () => {
        await expect(withRlsTransaction({integrationIds: [ID_A], statementTimeoutS: 0, callback: noop})).rejects.toThrow(/statementTimeoutS/);
        await expect(withRlsTransaction({integrationIds: [ID_A], statementTimeoutS: -5, callback: noop})).rejects.toThrow(/statementTimeoutS/);
        await expect(withRlsTransaction({integrationIds: [ID_A], statementTimeoutS: 1.5, callback: noop})).rejects.toThrow(/statementTimeoutS/);
    });

    it('rejects an invalid integration id', async () => {
        await expect(withRlsTransaction({integrationIds: ['not-a-uuid'], callback: noop})).rejects.toThrow(/Invalid integration ID/);
    });

    it('rejects a non-positive lockTimeoutS', async () => {
        await expect(withRlsTransaction({integrationIds: [ID_A], lockTimeoutS: 0, callback: noop})).rejects.toThrow(/lockTimeoutS/);
    });

    it('sets rls.integration_ids to an empty string for a caller without integrations', async () => {
        await withRlsTransaction({integrationIds: [], callback: noop});
        expect(executedSql()).toContain(`SET LOCAL rls.integration_ids = '';`);
    });

    it('runs the transaction on the given client instead of the default connection', async () => {
        const client = {transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({execute}))};
        await withRlsTransaction({integrationIds: [ID_A], client: client as never, callback: noop});
        expect(client.transaction).toHaveBeenCalledOnce();
        expect(transaction).not.toHaveBeenCalled();
    });
});
