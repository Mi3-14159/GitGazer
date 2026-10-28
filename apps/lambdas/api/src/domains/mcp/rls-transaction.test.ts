import {initDb, withRlsTransaction} from '@gitgazer/db/client';
import type {MemberRole} from '@gitgazer/db/types/members';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';

const {transaction, execute} = vi.hoisted(() => ({transaction: vi.fn(), execute: vi.fn()}));

vi.mock('drizzle-orm/aws-data-api/pg', () => ({drizzle: () => ({transaction})}));
vi.mock('@aws-sdk/client-rds-data', () => ({RDSDataClient: class {}}));

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';
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

    it('sets rls.integration_roles from the role map', async () => {
        await withRlsTransaction({integrationIds: [ID_A, ID_B], integrationRoles: {[ID_A]: 'admin', [ID_B]: 'viewer'}, callback: noop});
        expect(executedSql()).toContain(`SET LOCAL rls.integration_roles = '${ID_A}:admin,${ID_B}:viewer';`);
    });

    it('sets both settings to empty strings for a caller without integrations', async () => {
        await withRlsTransaction({integrationIds: [], integrationRoles: {}, callback: noop});
        expect(executedSql()).toContain(`SET LOCAL rls.integration_ids = '';`);
        expect(executedSql()).toContain(`SET LOCAL rls.integration_roles = '';`);
    });

    it('rejects an unknown role before starting the transaction', async () => {
        await expect(
            withRlsTransaction({integrationIds: [ID_A], integrationRoles: {[ID_A]: 'superuser' as MemberRole}, callback: noop}),
        ).rejects.toThrow('Invalid integration role');
        expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects a role map key that is not a UUID', async () => {
        await expect(withRlsTransaction({integrationIds: [], integrationRoles: {"x'; RESET ROLE; --": 'admin'}, callback: noop})).rejects.toThrow(
            /Invalid integration ID/,
        );
        expect(transaction).not.toHaveBeenCalled();
    });

    it('does not set rls.integration_roles when no role map is given', async () => {
        await withRlsTransaction({integrationIds: [ID_A], callback: noop});
        expect(executedSql().join('\n')).not.toContain('rls.integration_roles');
    });

    it('runs the transaction on the given client instead of the default connection', async () => {
        const client = {transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({execute}))};
        await withRlsTransaction({integrationIds: [ID_A], client: client as never, callback: noop});
        expect(client.transaction).toHaveBeenCalledOnce();
        expect(transaction).not.toHaveBeenCalled();
    });
});
