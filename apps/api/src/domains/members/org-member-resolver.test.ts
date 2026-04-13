import {beforeEach, describe, expect, it, vi} from 'vitest';

// ---- Mocks ----

const mockDb = {
    select: vi.fn(),
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
    users: Symbol('users'),
}));

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    githubOrgMembers: Symbol('githubOrgMembers'),
    userAssignments: Symbol('userAssignments'),
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('@/domains/event-log/event-log.controller', () => ({
    createEventLogEntry: (...args: any[]) => mockCreateEventLogEntry(...args),
}));

let resolver: typeof import('./org-member-resolver');

describe('org-member-resolver', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        mockCreateEventLogEntry.mockResolvedValue({});
        resolver = await import('./org-member-resolver');
    });

    describe('resolveAndAssignOrgMembers', () => {
        it('returns zeros when no org members exist', async () => {
            mockDb.select.mockReturnValue({
                from: () => ({
                    where: () => Promise.resolve([]),
                }),
            });

            const result = await resolver.resolveAndAssignOrgMembers({
                integrationId: 'int-1',
                installationId: 123,
                role: 'viewer',
                accountLogin: 'test-org',
            });

            expect(result).toEqual({matched: 0, unmatched: 0});
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });

        it('matches org members to GitGazer users and inserts assignments via RLS transaction', async () => {
            const orgMembers = [
                {installationId: 123, githubUserId: 1001, githubLogin: 'alice', role: 'admin', syncedAt: new Date()},
                {installationId: 123, githubUserId: 1002, githubLogin: 'bob', role: 'member', syncedAt: new Date()},
            ];

            const matchedUsers = [{id: 10, githubId: 1001}];

            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => ({
                from: () => ({
                    where: () => {
                        selectCallCount++;
                        if (selectCallCount === 1) return Promise.resolve(orgMembers);
                        return Promise.resolve(matchedUsers);
                    },
                }),
            }));

            const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
            const mockValues = vi.fn().mockReturnValue({onConflictDoNothing: mockOnConflictDoNothing});
            const mockInsert = vi.fn().mockReturnValue({values: mockValues});

            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {insert: mockInsert};
                return params.callback(mockTx);
            });

            const result = await resolver.resolveAndAssignOrgMembers({
                integrationId: 'int-1',
                installationId: 123,
                role: 'member',
                accountLogin: 'test-org',
            });

            expect(result).toEqual({matched: 1, unmatched: 1});
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationIds: ['int-1'],
                    userName: 'gitgazer_writer',
                }),
            );
            expect(mockInsert).toHaveBeenCalledTimes(1);
            expect(mockValues).toHaveBeenCalledWith([{integrationId: 'int-1', userId: 10, role: 'member'}]);
            expect(mockOnConflictDoNothing).toHaveBeenCalled();
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationId: 'int-1',
                    title: 'Org members auto-synced',
                }),
            );
        });

        it('handles all unmatched members gracefully', async () => {
            const orgMembers = [{installationId: 123, githubUserId: 9999, githubLogin: 'unknown', role: 'member', syncedAt: new Date()}];

            let selectCallCount = 0;
            mockDb.select.mockImplementation(() => ({
                from: () => ({
                    where: () => {
                        selectCallCount++;
                        if (selectCallCount === 1) return Promise.resolve(orgMembers);
                        return Promise.resolve([]);
                    },
                }),
            }));

            const result = await resolver.resolveAndAssignOrgMembers({
                integrationId: 'int-1',
                installationId: 123,
                role: 'viewer',
                accountLogin: 'test-org',
            });

            expect(result).toEqual({matched: 0, unmatched: 1});
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });
    });
});
