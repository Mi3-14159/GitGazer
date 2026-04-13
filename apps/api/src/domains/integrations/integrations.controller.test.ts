import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWithRlsTransaction = vi.fn();

vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
    db: {transaction: vi.fn()},
}));

vi.mock('@gitgazer/db/queries', () => ({
    integrationsQueryRelations: {},
}));

vi.mock('@gitgazer/db/schema/app', () => ({
    gitgazerWriter: {name: 'gitgazer_writer'},
}));

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    githubAppWebhooks: Symbol('githubAppWebhooks'),
    integrations: Symbol('integrations'),
    userAssignments: Symbol('userAssignments'),
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('@/domains/event-log/event-log.controller', () => ({
    createEventLogEntry: (...args: any[]) => mockCreateEventLogEntry(...args),
}));

vi.mock('@/domains/github-app/webhook-provisioning', () => ({
    deprovisionAllWebhooks: vi.fn(),
    updateAllWebhookSecrets: vi.fn(),
}));

let controller: typeof import('./integrations.controller');

describe('integrations controller', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        mockCreateEventLogEntry.mockResolvedValue({});
        controller = await import('./integrations.controller');
    });

    describe('updateOrgSyncSettings', () => {
        it('updates the org sync default role', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    update: () => ({
                        set: () => ({
                            where: () => ({
                                returning: () => Promise.resolve([{integrationId: 'int-1', orgSyncDefaultRole: 'member'}]),
                            }),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await controller.updateOrgSyncSettings({
                integrationId: 'int-1',
                defaultRole: 'member',
                integrationIds: ['int-1'],
            });

            expect(mockWithRlsTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationIds: ['int-1'],
                    userName: 'gitgazer_writer',
                }),
            );

            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationId: 'int-1',
                    title: 'Org sync settings updated',
                }),
            );
        });

        it('throws when integration not found', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    update: () => ({
                        set: () => ({
                            where: () => ({
                                returning: () => Promise.resolve([]),
                            }),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(
                controller.updateOrgSyncSettings({
                    integrationId: 'nonexistent',
                    defaultRole: 'viewer',
                    integrationIds: ['nonexistent'],
                }),
            ).rejects.toThrow('Integration not found or access denied');
        });
    });
});
