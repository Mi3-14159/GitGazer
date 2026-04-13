import {beforeEach, describe, expect, it, vi} from 'vitest';

// ---- Mocks ----

const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
};

const mockWithRlsTransaction = vi.fn();

vi.mock('@gitgazer/db/client', () => ({
    db: mockDb,
    RdsTransaction: {},
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
}));

vi.mock('@gitgazer/db/schema/app', () => ({
    gitgazerWriter: {name: 'gitgazer_writer'},
}));

vi.mock('@gitgazer/db/schema/gitgazer', () => ({
    users: {githubId: Symbol('users.githubId')},
}));

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    githubAppInstallations: {
        installationId: Symbol('installationId'),
        integrationId: Symbol('integrationId'),
        accountType: Symbol('accountType'),
        accountLogin: Symbol('accountLogin'),
    },
    githubAppWebhooks: {installationId: Symbol('installationId')},
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

vi.mock('@/shared/clients/sqs.client', () => ({
    sendOrgMemberSyncTask: vi.fn(),
}));

vi.mock('@/shared/config', () => ({
    default: {
        get: vi.fn().mockReturnValue('https://sqs.queue.url'),
    },
}));

vi.mock('./webhook-provisioning', () => ({
    provisionWebhooksForRepos: vi.fn(),
}));

const mockCreateEventLogEntry = vi.fn().mockResolvedValue(undefined);
vi.mock('@/domains/event-log/event-log.controller', () => ({
    createEventLogEntry: (...args: any[]) => mockCreateEventLogEntry(...args),
}));

let controller: typeof import('./github-app.controller');

// Helper to build a chainable select mock (supports .from().where() and .from().innerJoin().where())
const buildSelectChain = (result: any) => ({
    from: () => ({
        innerJoin: () => ({
            where: () => Promise.resolve(result),
        }),
        where: () => Promise.resolve(result),
    }),
});

// Helper to build a chainable insert mock
const buildInsertChain = () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({onConflictDoNothing, onConflictDoUpdate});
    return {values, onConflictDoNothing, onConflictDoUpdate};
};

// Helper to build a chainable delete mock
const buildDeleteChain = () => ({
    where: vi.fn().mockResolvedValue(undefined),
});

// Helper to build a chainable delete mock with .returning()
const buildDeleteReturningChain = (result: any[] = []) => ({
    where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
    }),
});

describe('github-app.controller — organization events', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        controller = await import('./github-app.controller');
    });

    describe('organization.member_added — integration sync', () => {
        const memberAddedEvent = {
            action: 'member_added',
            organization: {login: 'test-org', id: 100},
            membership: {
                role: 'member',
                user: {id: 5001, login: 'alice'},
            },
            installation: {id: 42},
            sender: {login: 'admin-user', id: 1},
        };

        it('upserts org member and auto-adds to linked integration when user exists', async () => {
            // Mock insert for githubOrgMembers upsert
            const insertChain = buildInsertChain();
            mockDb.insert.mockReturnValue({values: insertChain.values});

            // Mock select calls in order:
            // 1. innerJoin: installation+integration → integrationId + orgSyncDefaultRole
            // 2. GitGazer user lookup by github_id
            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => {
                selectCallCount++;
                switch (selectCallCount) {
                    case 1: // installation+integration innerJoin
                        return buildSelectChain([{integrationId: 'int-abc', orgSyncDefaultRole: 'viewer'}]);
                    case 2: // GitGazer user lookup
                        return buildSelectChain([{id: 99}]);
                    default:
                        return buildSelectChain([]);
                }
            });

            // Mock RLS transaction for user-assignment insert with .returning()
            const mockOnConflictDoNothing = vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{userId: 99}]),
            });
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    insert: vi.fn().mockReturnValue({
                        values: vi.fn().mockReturnValue({onConflictDoNothing: mockOnConflictDoNothing}),
                    }),
                };
                return params.callback(mockTx);
            });

            await controller.handleGithubAppEvent('organization', memberAddedEvent);

            // Verify org member was inserted
            expect(mockDb.insert).toHaveBeenCalled();

            // Verify user-assignment was created via RLS transaction
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationIds: ['int-abc'],
                    userName: 'gitgazer_writer',
                }),
            );

            // Verify event log entry was created (because a row was actually inserted)
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationId: 'int-abc',
                    category: 'integration',
                    type: 'info',
                    title: 'Org member auto-added',
                }),
            );
        });

        it('skips event log when user-assignment already exists (conflict)', async () => {
            const insertChain = buildInsertChain();
            mockDb.insert.mockReturnValue({values: insertChain.values});

            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => {
                selectCallCount++;
                switch (selectCallCount) {
                    case 1:
                        return buildSelectChain([{integrationId: 'int-abc', orgSyncDefaultRole: 'viewer'}]);
                    case 2:
                        return buildSelectChain([{id: 99}]);
                    default:
                        return buildSelectChain([]);
                }
            });

            // .returning() returns empty array → conflict, no insert
            const mockOnConflictDoNothing = vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
            });
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    insert: vi.fn().mockReturnValue({
                        values: vi.fn().mockReturnValue({onConflictDoNothing: mockOnConflictDoNothing}),
                    }),
                };
                return params.callback(mockTx);
            });

            await controller.handleGithubAppEvent('organization', memberAddedEvent);

            expect(mockWithRlsTransaction).toHaveBeenCalled();
            expect(mockCreateEventLogEntry).not.toHaveBeenCalled();
        });

        it('skips integration sync when installation is not linked', async () => {
            const insertChain = buildInsertChain();
            mockDb.insert.mockReturnValue({values: insertChain.values});

            // innerJoin returns empty when installation has no linked integration
            mockDb.select.mockImplementation(() => buildSelectChain([]));

            await controller.handleGithubAppEvent('organization', memberAddedEvent);

            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
            expect(mockCreateEventLogEntry).not.toHaveBeenCalled();
        });

        it('skips integration sync when user has no GitGazer account', async () => {
            const insertChain = buildInsertChain();
            mockDb.insert.mockReturnValue({values: insertChain.values});

            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => {
                selectCallCount++;
                switch (selectCallCount) {
                    case 1: // innerJoin: installation+integration
                        return buildSelectChain([{integrationId: 'int-abc', orgSyncDefaultRole: 'member'}]);
                    case 2: // No GitGazer user found
                        return buildSelectChain([]);
                    default:
                        return buildSelectChain([]);
                }
            });

            await controller.handleGithubAppEvent('organization', memberAddedEvent);

            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
            expect(mockCreateEventLogEntry).not.toHaveBeenCalled();
        });
    });

    describe('organization.member_removed — integration sync', () => {
        const memberRemovedEvent = {
            action: 'member_removed',
            organization: {login: 'test-org', id: 100},
            membership: {
                role: 'member',
                user: {id: 5001, login: 'alice'},
            },
            installation: {id: 42},
            sender: {login: 'admin-user', id: 1},
        };

        it('deletes org member and removes org_sync assignment from linked integration', async () => {
            // Mock delete for githubOrgMembers
            mockDb.delete.mockReturnValue(buildDeleteChain());

            // Mock select calls:
            // 1. Installation+integration innerJoin → linked
            // 2. GitGazer user lookup → found
            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => {
                selectCallCount++;
                switch (selectCallCount) {
                    case 1:
                        return buildSelectChain([{integrationId: 'int-abc'}]);
                    case 2:
                        return buildSelectChain([{id: 99}]);
                    default:
                        return buildSelectChain([]);
                }
            });

            // Mock RLS transaction for delete with .returning()
            const mockTxDelete = buildDeleteReturningChain([{userId: 99}]);
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {delete: vi.fn().mockReturnValue(mockTxDelete)};
                return params.callback(mockTx);
            });

            await controller.handleGithubAppEvent('organization', memberRemovedEvent);

            // Verify org member was deleted
            expect(mockDb.delete).toHaveBeenCalled();

            // Verify user-assignment removal via RLS transaction (source='org_sync' only)
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationIds: ['int-abc'],
                    userName: 'gitgazer_writer',
                }),
            );

            // Verify event log entry was created for removal
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationId: 'int-abc',
                    category: 'integration',
                    type: 'warning',
                    title: 'Org member auto-removed',
                }),
            );
        });

        it('skips integration sync when installation is not linked', async () => {
            mockDb.delete.mockReturnValue(buildDeleteChain());
            // innerJoin returns empty (not linked)
            mockDb.select.mockImplementation(() => buildSelectChain([]));

            await controller.handleGithubAppEvent('organization', memberRemovedEvent);

            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
            expect(mockCreateEventLogEntry).not.toHaveBeenCalled();
        });

        it('skips integration sync when user has no GitGazer account', async () => {
            mockDb.delete.mockReturnValue(buildDeleteChain());

            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => {
                selectCallCount++;
                switch (selectCallCount) {
                    case 1:
                        return buildSelectChain([{integrationId: 'int-abc'}]);
                    case 2:
                        return buildSelectChain([]); // No GitGazer user
                    default:
                        return buildSelectChain([]);
                }
            });

            await controller.handleGithubAppEvent('organization', memberRemovedEvent);

            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
            expect(mockCreateEventLogEntry).not.toHaveBeenCalled();
        });
    });

    describe('organization — unhandled actions', () => {
        it('does not throw for unhandled organization actions', async () => {
            const event = {
                action: 'member_invited',
                organization: {login: 'test-org', id: 100},
                installation: {id: 42},
                sender: {login: 'admin-user', id: 1},
            };

            await expect(controller.handleGithubAppEvent('organization', event)).resolves.not.toThrow();
        });

        it('returns silently when installation context is missing', async () => {
            const event = {
                action: 'member_added',
                organization: {login: 'test-org', id: 100},
                sender: {login: 'admin-user', id: 1},
            };

            await expect(controller.handleGithubAppEvent('organization', event)).resolves.not.toThrow();
        });
    });
});
