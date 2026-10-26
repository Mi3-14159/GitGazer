import {integrationAppSlackSettings, slackWorkspaces} from '@gitgazer/db/schema/gitgazer';
import type {SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {mockDb, rowsByTable, updates} = vi.hoisted(() => {
    const rowsByTable = new Map<unknown, unknown[]>();
    const updates: {set: unknown; where: SQL; rows: unknown[]}[] = [];
    const updateResult: {rows: unknown[]} = {rows: []};
    const select = () => {
        const chain = {
            from: (table: unknown) => ({where: () => Promise.resolve(rowsByTable.get(table) ?? [])}),
        };
        return chain;
    };
    const mockDb = {
        select,
        update: () => ({
            set: (set: unknown) => ({
                where: (where: SQL) => ({
                    returning: () => {
                        updates.push({set, where, rows: updateResult.rows});
                        return Promise.resolve(updateResult.rows);
                    },
                }),
            }),
        }),
        updateResult,
    };
    return {mockDb, rowsByTable, updates};
});

const mockWithRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    db: mockDb,
    withRlsTransaction: (...args: unknown[]) => mockWithRlsTransaction(...args),
}));

const mockDecryptToken = vi.fn();
vi.mock('@gitgazer/backend-core/helpers/token-crypto', () => ({
    decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import {loadWorkspaceForIntegration, markWorkspaceDisconnected} from './workspaces';

const dialect = new PgDialect();

describe('workspaces', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rowsByTable.clear();
        updates.length = 0;
        mockDb.updateResult.rows = [];
        mockDecryptToken.mockResolvedValue('xoxb-1');
        mockWithRlsTransaction.mockImplementation(async (p: {callback: (tx: typeof mockDb) => unknown}) => p.callback(mockDb));
    });

    describe('loadWorkspaceForIntegration', () => {
        it('returns the workspace with the decrypted bot token', async () => {
            rowsByTable.set(integrationAppSlackSettings, [{teamId: 'T1'}]);
            rowsByTable.set(slackWorkspaces, [{botTokenCiphertext: 'cipher', disconnectedAt: null}]);

            await expect(loadWorkspaceForIntegration('int-1')).resolves.toEqual({teamId: 'T1', botToken: 'xoxb-1', disconnected: false});
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({integrationIds: ['int-1']}));
            expect(mockDecryptToken).toHaveBeenCalledWith('cipher');
        });

        it('reports a disconnected workspace without decrypting its token', async () => {
            rowsByTable.set(integrationAppSlackSettings, [{teamId: 'T1'}]);
            rowsByTable.set(slackWorkspaces, [{botTokenCiphertext: 'cipher', disconnectedAt: new Date()}]);

            await expect(loadWorkspaceForIntegration('int-1')).resolves.toEqual({teamId: 'T1', botToken: '', disconnected: true});
            expect(mockDecryptToken).not.toHaveBeenCalled();
        });

        it('returns null without a Slack app', async () => {
            await expect(loadWorkspaceForIntegration('int-1')).resolves.toBeNull();
            expect(mockDecryptToken).not.toHaveBeenCalled();
        });
    });

    describe('markWorkspaceDisconnected', () => {
        it('markWorkspaceDisconnected returns integrations only on the transition', async () => {
            rowsByTable.set(integrationAppSlackSettings, [{integrationId: 'int-1'}, {integrationId: 'int-2'}]);
            mockDb.updateResult.rows = [{teamId: 'T1'}];

            await expect(markWorkspaceDisconnected('T1')).resolves.toEqual(['int-1', 'int-2']);
            expect(updates[0].set).toEqual({disconnectedAt: expect.any(Date)});
            const {sql, params} = dialect.sqlToQuery(updates[0].where);
            expect(sql).toContain('"disconnected_at" is null');
            expect(params).toEqual(['T1']);

            mockDb.updateResult.rows = [];
            await expect(markWorkspaceDisconnected('T1')).resolves.toEqual([]);
        });
    });
});
