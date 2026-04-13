import {beforeEach, describe, expect, it, vi} from 'vitest';

// ---- Mocks ----

const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
};

const mockWithRlsTransaction = vi.fn();

vi.mock('@gitgazer/db/client', () => ({
    db: mockDb,
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
}));

vi.mock('@gitgazer/db/schema/app', () => ({
    gitgazerWriter: {name: 'gitgazer_writer'},
}));

vi.mock('@gitgazer/db/schema/gitgazer', () => ({
    users: {
        id: Symbol('users.id'),
        githubId: Symbol('users.githubId'),
    },
}));

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    githubAppInstallations: {
        installationId: Symbol('installationId'),
        integrationId: Symbol('integrationId'),
    },
    githubOrgMembers: {
        installationId: Symbol('installationId'),
        githubUserId: Symbol('githubUserId'),
    },
    integrations: {
        integrationId: Symbol('integrationId'),
        orgSyncDefaultRole: Symbol('orgSyncDefaultRole'),
    },
    userAssignments: {
        userId: Symbol('userId'),
        integrationId: Symbol('integrationId'),
        source: Symbol('source'),
    },
}));

const mockListOrgMembers = vi.fn();
vi.mock('@/shared/clients/github-app.client', () => ({
    listOrgMembers: (...args: any[]) => mockListOrgMembers(...args),
}));

const mockResolveAndAssignOrgMembers = vi.fn();
vi.mock('@/domains/members/org-member-resolver', () => ({
    resolveAndAssignOrgMembers: (...args: any[]) => mockResolveAndAssignOrgMembers(...args),
}));

// Helper: chainable select mock supporting .from().where() and .from().innerJoin().where()
const buildSelectChain = (result: any) => ({
    from: () => ({
        innerJoin: () => ({
            where: () => Promise.resolve(result),
        }),
        where: () => Promise.resolve(result),
    }),
});

// Helper: chainable insert mock
const buildInsertChain = () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({onConflictDoUpdate});
    return {values, onConflictDoUpdate};
};

// Helper: chainable delete mock
const buildDeleteChain = () => ({
    where: vi.fn().mockResolvedValue(undefined),
});

let syncModule: typeof import('./org-member-sync');

describe('org-member-sync', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        mockResolveAndAssignOrgMembers.mockResolvedValue({matched: 0, unmatched: 0});
        syncModule = await import('./org-member-sync');
    });

    describe('syncOrgMembers — reconciliation', () => {
        it('calls reconcileIntegrationMembers and removes stale assignments', async () => {
            // Setup: listOrgMembers returns 1 member
            mockListOrgMembers.mockResolvedValue([{id: 1001, login: 'alice', role: 'member'}]);

            // Insert chain for batch upsert
            const insertChain = buildInsertChain();
            mockDb.insert.mockReturnValue({values: insertChain.values});

            // Delete chain for stale org member cleanup
            mockDb.delete.mockReturnValue(buildDeleteChain());

            // Select calls on db:
            // 1. innerJoin: installation+integration → linked
            // 2. currentOrgMemberIds
            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => {
                selectCallCount++;
                switch (selectCallCount) {
                    case 1: // installation+integration innerJoin
                        return buildSelectChain([{integrationId: 'int-abc', orgSyncDefaultRole: 'viewer'}]);
                    case 2: // currentOrgMemberIds
                        return buildSelectChain([{githubUserId: 1001}]);
                    default:
                        return buildSelectChain([]);
                }
            });

            // Mock RLS transaction: tx.select finds stale, tx.delete removes them
            const txDeleteChain = buildDeleteChain();
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: vi.fn().mockReturnValue(buildSelectChain([{userId: 50, githubId: 9999}])),
                    delete: vi.fn().mockReturnValue(txDeleteChain),
                };
                return params.callback(mockTx);
            });

            await syncModule.syncOrgMembers(42, 'test-org');

            // resolveAndAssignOrgMembers was called for auto-add
            expect(mockResolveAndAssignOrgMembers).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationId: 'int-abc',
                    installationId: 42,
                    role: 'viewer',
                    accountLogin: 'test-org',
                }),
            );

            // Stale assignment removed via RLS transaction
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationIds: ['int-abc'],
                    userName: 'gitgazer_writer',
                }),
            );
        });

        it('skips reconciliation when installation is not linked', async () => {
            mockListOrgMembers.mockResolvedValue([{id: 1001, login: 'alice', role: 'member'}]);

            const insertChain = buildInsertChain();
            mockDb.insert.mockReturnValue({values: insertChain.values});
            mockDb.delete.mockReturnValue(buildDeleteChain());

            // innerJoin returns empty (not linked)
            mockDb.select.mockImplementation(() => buildSelectChain([]));

            await syncModule.syncOrgMembers(42, 'test-org');

            expect(mockResolveAndAssignOrgMembers).not.toHaveBeenCalled();
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });

        it('skips stale cleanup when org members table is empty', async () => {
            mockListOrgMembers.mockResolvedValue([{id: 1001, login: 'alice', role: 'member'}]);

            const insertChain = buildInsertChain();
            mockDb.insert.mockReturnValue({values: insertChain.values});
            mockDb.delete.mockReturnValue(buildDeleteChain());

            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => {
                selectCallCount++;
                switch (selectCallCount) {
                    case 1: // linked
                        return buildSelectChain([{integrationId: 'int-abc', orgSyncDefaultRole: 'viewer'}]);
                    case 2: // currentOrgMemberIds — empty (transient error safety)
                        return buildSelectChain([]);
                    default:
                        return buildSelectChain([]);
                }
            });

            // Transaction is entered but callback returns early (no stale select/delete on tx)
            const mockTxSelect = vi.fn();
            const mockTxDelete = vi.fn();
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: mockTxSelect,
                    delete: mockTxDelete,
                };
                return params.callback(mockTx);
            });

            await syncModule.syncOrgMembers(42, 'test-org');

            // resolveAndAssignOrgMembers still called (auto-add)
            expect(mockResolveAndAssignOrgMembers).toHaveBeenCalled();

            // Early return before RLS transaction — no stale cleanup attempted
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });

        it('does not throw when reconciliation fails', async () => {
            mockListOrgMembers.mockResolvedValue([{id: 1001, login: 'alice', role: 'member'}]);

            const insertChain = buildInsertChain();
            mockDb.insert.mockReturnValue({values: insertChain.values});
            mockDb.delete.mockReturnValue(buildDeleteChain());

            // First select (innerJoin) throws to simulate reconciliation failure
            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => {
                selectCallCount++;
                if (selectCallCount === 1) {
                    // This is the reconciliation innerJoin — throw
                    return {
                        from: () => ({
                            innerJoin: () => ({
                                where: () => Promise.reject(new Error('DB connection lost')),
                            }),
                            where: () => Promise.resolve([]),
                        }),
                    };
                }
                return buildSelectChain([]);
            });

            // Should not throw — reconciliation error is caught
            await expect(syncModule.syncOrgMembers(42, 'test-org')).resolves.not.toThrow();
        });
    });

    describe('syncOrgMembers — core sync', () => {
        it('skips stale member cleanup when GitHub returns empty list', async () => {
            mockListOrgMembers.mockResolvedValue([]);

            // The reconciliation select — not linked, so returns empty
            mockDb.select.mockImplementation(() => buildSelectChain([]));

            await syncModule.syncOrgMembers(42, 'test-org');

            // No insert (no members to upsert)
            expect(mockDb.insert).not.toHaveBeenCalled();

            // No delete (safety guard for empty response)
            expect(mockDb.delete).not.toHaveBeenCalled();
        });
    });
});
