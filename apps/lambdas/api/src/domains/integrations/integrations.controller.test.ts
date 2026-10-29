import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockEq = vi.fn();
vi.mock('drizzle-orm', async (importOriginal) => {
    const actual = await importOriginal<typeof import('drizzle-orm')>();
    return {
        ...actual,
        eq: (...args: Parameters<typeof actual.eq>) => {
            mockEq(...args);
            return actual.eq(...args);
        },
    };
});

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

const mockGetGithubSettings = vi.fn();
vi.mock('@gitgazer/backend-services/github-app/github-settings', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@gitgazer/backend-services/github-app/github-settings')>()),
    getGithubSettings: (...args: any[]) => mockGetGithubSettings(...args),
}));

vi.mock('@gitgazer/db/queries', () => ({
    integrationsQueryRelations: {},
}));

vi.mock('@gitgazer/db/schema/app', () => ({
    gitgazerWriter: {name: 'gitgazer_writer'},
}));

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    githubAppWebhooks: Symbol('githubAppWebhooks'),
    integrations: {integrationId: Symbol('integrations.integrationId'), ownerId: Symbol('integrations.ownerId')},
    userAssignments: Symbol('userAssignments'),
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({
    createEventLogEntry: (...args: any[]) => mockCreateEventLogEntry(...args),
}));

const mockDeprovisionAllWebhooks = vi.fn();
vi.mock('@gitgazer/backend-services/github-app/webhook-provisioning', () => ({
    deprovisionAllWebhooks: (...args: any[]) => mockDeprovisionAllWebhooks(...args),
    updateWebhookSecrets: vi.fn(),
}));

const mockFindSlackTeamId = vi.fn();
const mockReleaseWorkspaceIfUnused = vi.fn();
vi.mock('@/domains/apps/apps.controller', () => ({
    findSlackTeamId: (...args: any[]) => mockFindSlackTeamId(...args),
    releaseWorkspaceIfUnused: (...args: any[]) => mockReleaseWorkspaceIfUnused(...args),
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

        const WEBHOOK_5A = {installationId: 5, webhookId: 11, targetType: 'organization', targetName: 'org-a'};
        const WEBHOOK_5B = {installationId: 5, webhookId: 12, targetType: 'repository', targetName: 'org-a/repo'};
        const WEBHOOK_6 = {installationId: 6, webhookId: 21, targetType: 'organization', targetName: 'org-b'};

        const rotationTx = (webhooks: unknown[], calls: string[] = []) => ({
            update: () => {
                calls.push('update');
                return settingsUpdateTx([{secret: 'new-secret'}]).update();
            },
            select: () => ({from: () => ({where: () => Promise.resolve(webhooks)})}),
        });

        it('rotates the secret on the GitHub app settings and updates the webhooks it captured', async () => {
            let updateTarget: unknown;
            mockGetGithubSettings.mockResolvedValue({appId: 'app-1', secret: 'old-secret'});
            mockWithRlsTransaction.mockImplementation(async (params) => {
                if (params.userName) {
                    const tx = rotationTx([WEBHOOK_5A, WEBHOOK_5B, WEBHOOK_6]);
                    return params.callback({
                        ...tx,
                        update: (table: unknown) => {
                            updateTarget = table;
                            return tx.update();
                        },
                    });
                }
                return params.callback({query: {integrations: {findMany: () => Promise.resolve([{integrationId: 'int-1'}])}}});
            });
            const webhooks = await import('@gitgazer/backend-services/github-app/webhook-provisioning');
            const schema = await import('@gitgazer/db/schema/gitgazer');

            await controller.rotateSecret({integrationId: 'int-1', integrationIds: ['int-1']});

            expect(updateTarget).toBe(schema.integrationAppGithubSettings);
            expect(webhooks.updateWebhookSecrets).toHaveBeenCalledTimes(2);
            expect(webhooks.updateWebhookSecrets).toHaveBeenCalledWith('int-1', 5, [WEBHOOK_5A, WEBHOOK_5B], 'new-secret');
            expect(webhooks.updateWebhookSecrets).toHaveBeenCalledWith('int-1', 6, [WEBHOOK_6], 'new-secret');
        });

        it('locks the settings row before rotating and never re-reads webhooks after the commit', async () => {
            const order: string[] = [];
            mockGetGithubSettings.mockImplementation(async (_tx, _id, lock) => {
                order.push(`settings:${lock}`);
                return {appId: 'app-1', secret: 'old-secret'};
            });
            let transactions = 0;
            mockWithRlsTransaction.mockImplementation(async (params) => {
                transactions += 1;
                if (params.userName) return params.callback(rotationTx([WEBHOOK_5A], order));
                return params.callback({query: {integrations: {findMany: () => Promise.resolve([{integrationId: 'int-1'}])}}});
            });
            const webhooks = await import('@gitgazer/backend-services/github-app/webhook-provisioning');
            vi.mocked(webhooks.updateWebhookSecrets).mockImplementation(async () => {
                // A reinstall recorded after the commit is not part of the captured set
                order.push('github');
            });

            await controller.rotateSecret({integrationId: 'int-1', integrationIds: ['int-1']});

            expect(order).toEqual(['settings:update', 'update', 'github']);
            expect(webhooks.updateWebhookSecrets).toHaveBeenCalledWith('int-1', 5, [WEBHOOK_5A], 'new-secret');
            // rotation transaction + getIntegrations only
            expect(transactions).toBe(2);
        });

        it('rotateSecret throws NotFound without a GitHub app', async () => {
            mockGetGithubSettings.mockResolvedValue(undefined);
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(settingsUpdateTx([])));

            await expect(controller.rotateSecret({integrationId: 'int-1', integrationIds: ['int-1']})).rejects.toThrow('GitHub app not installed');
        });
    });

    describe('deleteIntegration', () => {
        const order: string[] = [];
        let ownerRows: {userId: number}[] = [];
        const deleteTx = {
            select: () => ({
                from: (table: unknown) => ({
                    where: () =>
                        table === userAssignmentsTable ? Promise.resolve(ownerRows) : {groupBy: () => Promise.resolve([{installationId: 42}])},
                }),
            }),
            delete: () => ({
                where: () => {
                    order.push('delete');
                    return Promise.resolve();
                },
            }),
        };

        let userAssignmentsTable: unknown;

        beforeEach(async () => {
            ({userAssignments: userAssignmentsTable} = await import('@gitgazer/db/schema/github/workflows'));
            ownerRows = [{userId: 7}];
            order.length = 0;
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(deleteTx));
            mockReleaseWorkspaceIfUnused.mockImplementation(async () => {
                order.push('release');
            });
        });

        it('reads the Slack workspace before the delete and releases it afterwards', async () => {
            mockFindSlackTeamId.mockImplementation(async () => {
                order.push('team');
                return 'T1';
            });

            await controller.deleteIntegration('int-1', ['int-1'], 7);

            expect(order).toEqual(['team', 'delete', 'release']);
            expect(mockReleaseWorkspaceIfUnused).toHaveBeenCalledWith('int-1', 'T1');
        });

        it('refuses a caller who is not an owner before removing any webhooks', async () => {
            ownerRows = [];

            await expect(controller.deleteIntegration('int-1', ['int-1'], 7)).rejects.toThrow('Only owners can delete an integration');

            expect(mockDeprovisionAllWebhooks).not.toHaveBeenCalled();
            expect(order).toEqual([]);
        });

        it('lets any owner delete, not only the creator', async () => {
            const {integrations} = await import('@gitgazer/db/schema/github/workflows');
            mockFindSlackTeamId.mockResolvedValue(undefined);

            await controller.deleteIntegration('int-1', ['int-1'], 7);

            expect(mockEq).toHaveBeenCalledWith(integrations.integrationId, 'int-1');
            expect(mockEq).not.toHaveBeenCalledWith(integrations.ownerId, 7);
        });

        it('releases nothing without a Slack app', async () => {
            mockFindSlackTeamId.mockResolvedValue(undefined);

            await controller.deleteIntegration('int-1', ['int-1'], 7);

            expect(order).toEqual(['delete']);
            expect(mockReleaseWorkspaceIfUnused).not.toHaveBeenCalled();
        });
    });
});
