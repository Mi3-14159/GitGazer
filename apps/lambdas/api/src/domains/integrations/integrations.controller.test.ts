import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWithRlsTransaction = vi.fn();

const mockTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
    db: {transaction: (...args: any[]) => mockTransaction(...args)},
}));

vi.mock('@gitgazer/db/schema/gitgazer', () => ({
    integrationAppGithubSettings: {
        integrationId: Symbol('integrationAppGithubSettings.integrationId'),
        appId: Symbol('integrationAppGithubSettings.appId'),
        secret: Symbol('integrationAppGithubSettings.secret'),
    },
    integrationApps: Symbol('integrationApps'),
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
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({
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

    describe('getIntegrations', () => {
        it('leaves the legacy secret and org sync role columns out of the response', async () => {
            const findMany = vi.fn().mockResolvedValue([{integrationId: 'int-1'}]);
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback({query: {integrations: {findMany}}}));

            await controller.getIntegrations({integrationIds: ['int-1']});

            expect(findMany).toHaveBeenCalledWith(expect.objectContaining({columns: {secret: false, orgSyncDefaultRole: false}}));
        });
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
            ).rejects.toThrow('GitHub app not installed');
        });
    });

    describe('createIntegration', () => {
        it('creates a GitHub app with the integration', async () => {
            const inserts: {table: unknown; values: any}[] = [];
            const tx = {
                insert: (table: unknown) => ({
                    values: (values: any) => {
                        inserts.push({table, values});
                        return {returning: () => Promise.resolve([{integrationId: 'int-1', appId: 'app-1'}])};
                    },
                }),
            };
            mockTransaction.mockImplementation(async (callback: Function) => callback(tx));
            mockWithRlsTransaction.mockResolvedValue([{integrationId: 'int-1'}]);
            const schema = await import('@gitgazer/db/schema/gitgazer');

            await controller.upsertIntegration({label: 'My integration', userId: 7, integrationIds: []});

            const appInsert = inserts.find((i) => i.table === schema.integrationApps);
            expect(appInsert?.values).toEqual({integrationId: 'int-1', type: 'github'});
            const settingsInsert = inserts.find((i) => i.table === schema.integrationAppGithubSettings);
            expect(settingsInsert?.values).toEqual({integrationId: 'int-1', appId: 'app-1'});
        });
    });

    describe('rotateSecret', () => {
        const settingsUpdateTx = (rows: unknown[], onSet?: (values: unknown) => void) => ({
            update: () => ({
                set: (values: unknown) => {
                    onSet?.(values);
                    return {where: () => ({returning: () => Promise.resolve(rows)})};
                },
            }),
        });

        it('rotates the secret on the GitHub app settings', async () => {
            let updateTarget: unknown;
            mockWithRlsTransaction.mockImplementation(async (params) => {
                if (params.userName) {
                    return params.callback({
                        update: (table: unknown) => {
                            updateTarget = table;
                            return settingsUpdateTx([{secret: 'new-secret'}]).update();
                        },
                    });
                }
                return params.callback({
                    select: () => ({from: () => ({where: () => ({groupBy: () => Promise.resolve([{installationId: 5}])})})}),
                    query: {integrations: {findMany: () => Promise.resolve([{integrationId: 'int-1'}])}},
                });
            });
            const webhooks = await import('@/domains/github-app/webhook-provisioning');
            const schema = await import('@gitgazer/db/schema/gitgazer');

            await controller.rotateSecret({integrationId: 'int-1', integrationIds: ['int-1']});

            expect(updateTarget).toBe(schema.integrationAppGithubSettings);
            expect(webhooks.updateAllWebhookSecrets).toHaveBeenCalledWith('int-1', 5, 'new-secret');
        });

        it('rotateSecret throws NotFound without a GitHub app', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(settingsUpdateTx([])));

            await expect(controller.rotateSecret({integrationId: 'int-1', integrationIds: ['int-1']})).rejects.toThrow('GitHub app not installed');
        });
    });
});
