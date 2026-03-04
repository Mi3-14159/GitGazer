import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWithRlsTransaction = vi.fn();
vi.mock('@/clients/rds', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
}));

vi.mock('@/drizzle/schema', () => ({
    notificationRules: Symbol('notificationRules'),
}));

let notifications: typeof import('./notifications');

describe('notifications controller', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        notifications = await import('./notifications');
    });

    it('getNotificationRules returns [] when integrationIds is empty', async () => {
        const out = await notifications.getNotificationRules({integrationIds: []});

        expect(out).toEqual([]);
        expect(mockWithRlsTransaction).not.toHaveBeenCalled();
    });

    it('upsertNotificationRule throws when user is not in the integration group', async () => {
        await expect(
            notifications.upsertNotificationRule({
                rule: {
                    enabled: true,
                    channels: [],
                    ignore_dependabot: false,
                    rule: {
                        owner: 'o',
                        repository_name: 'r',
                        workflow_name: 'w',
                        head_branch: 'b',
                    },
                } as any,
                integrationId: 'integrationA',
                userIntegrationIds: ['integrationB'],
                createOnly: true,
            }),
        ).rejects.toThrow('Unauthorized to create/update notification rule for this integration');
    });

    it('upsertNotificationRule generates an id when creating and persists rule via RDS', async () => {
        const now = new Date();
        mockWithRlsTransaction.mockImplementation(async (_ids: string[], cb: Function) => {
            const mockTx = {
                insert: () => ({
                    values: () => ({
                        onConflictDoUpdate: () => ({
                            returning: () =>
                                Promise.resolve([
                                    {
                                        id: 'uuid-123',
                                        integrationId: 'integrationA',
                                        channels: [],
                                        enabled: true,
                                        ignore_dependabot: false,
                                        rule: {owner: 'o', repository_name: 'r', workflow_name: 'w', head_branch: 'b'},
                                        createdAt: now,
                                        updatedAt: now,
                                    },
                                ]),
                        }),
                    }),
                }),
            };
            return cb(mockTx);
        });

        const rule: any = {
            enabled: true,
            channels: [],
            ignore_dependabot: false,
            rule: {
                owner: 'o',
                repository_name: 'r',
                workflow_name: 'w',
                head_branch: 'b',
            },
        };

        const out = await notifications.upsertNotificationRule({
            rule,
            integrationId: 'integrationA',
            userIntegrationIds: ['integrationA'],
            createOnly: true,
        });

        expect(mockWithRlsTransaction).toHaveBeenCalledTimes(1);
        expect(out.id).toBe('uuid-123');
        expect(out.integrationId).toBe('integrationA');
    });

    it('deleteNotificationRule throws when user is not in the integration group', async () => {
        await expect(notifications.deleteNotificationRule('rule-1', 'integrationA', ['integrationB'])).rejects.toThrow(
            'Unauthorized to delete notification rule for this integration',
        );

        expect(mockWithRlsTransaction).not.toHaveBeenCalled();
    });

    it('deleteNotificationRule calls delete when authorized', async () => {
        mockWithRlsTransaction.mockImplementation(async (_ids: string[], cb: Function) => {
            const mockTx = {
                delete: () => ({
                    where: () => Promise.resolve(),
                }),
            };
            return cb(mockTx);
        });

        await notifications.deleteNotificationRule('rule-1', 'integrationA', ['integrationA']);

        expect(mockWithRlsTransaction).toHaveBeenCalledTimes(1);
        expect(mockWithRlsTransaction).toHaveBeenCalledWith(['integrationA'], expect.any(Function));
    });
});
