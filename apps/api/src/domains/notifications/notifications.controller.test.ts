import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWithRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
}));

vi.mock('@gitgazer/db/schema', () => ({
    notificationRules: Symbol('notificationRules'),
    gitgazerWriter: {name: 'gitgazer_writer'},
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('@/domains/event-log/event-log.controller', () => ({
    createEventLogEntry: (...args: any[]) => mockCreateEventLogEntry(...args),
}));

vi.mock('@/shared/logger', () => ({
    getLogger: () => ({error: vi.fn(), info: vi.fn(), warn: vi.fn()}),
}));

let notifications: typeof import('./notifications.controller');

describe('notifications controller', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        mockCreateEventLogEntry.mockResolvedValue({});
        notifications = await import('./notifications.controller');
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
        mockWithRlsTransaction.mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
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
            return params.callback(mockTx);
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

        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'integrationA',
                category: 'notification',
                type: 'info',
                title: 'Notification rule created',
                message: expect.stringContaining('o/r/w/b'),
            }),
        );
    });

    it('upsertNotificationRule succeeds even when event log entry fails', async () => {
        const now = new Date();
        mockWithRlsTransaction.mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const mockTx = {
                insert: () => ({
                    values: () => ({
                        onConflictDoUpdate: () => ({
                            returning: () =>
                                Promise.resolve([
                                    {
                                        id: 'uuid-456',
                                        integrationId: 'integrationA',
                                        channels: [],
                                        enabled: true,
                                        ignore_dependabot: false,
                                        rule: {owner: '*', repository_name: '*', workflow_name: '*', head_branch: '*'},
                                        createdAt: now,
                                        updatedAt: now,
                                    },
                                ]),
                        }),
                    }),
                }),
            };
            return params.callback(mockTx);
        });
        mockCreateEventLogEntry.mockRejectedValue(new Error('DB down'));

        const out = await notifications.upsertNotificationRule({
            rule: {
                enabled: true,
                channels: [],
                ignore_dependabot: false,
                rule: {owner: '*', repository_name: '*', workflow_name: '*', head_branch: '*'},
            } as any,
            integrationId: 'integrationA',
            userIntegrationIds: ['integrationA'],
            createOnly: true,
        });

        expect(out.id).toBe('uuid-456');
    });

    it('deleteNotificationRule throws when user is not in the integration group', async () => {
        await expect(notifications.deleteNotificationRule('rule-1', 'integrationA', ['integrationB'])).rejects.toThrow(
            'Unauthorized to delete notification rule for this integration',
        );

        expect(mockWithRlsTransaction).not.toHaveBeenCalled();
    });

    it('deleteNotificationRule calls delete when authorized', async () => {
        mockWithRlsTransaction.mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const mockTx = {
                delete: () => ({
                    where: () => Promise.resolve(),
                }),
            };
            return params.callback(mockTx);
        });

        await notifications.deleteNotificationRule('rule-1', 'integrationA', ['integrationA']);

        expect(mockWithRlsTransaction).toHaveBeenCalledTimes(1);
        expect(mockWithRlsTransaction).toHaveBeenCalledWith(
            expect.objectContaining({integrationIds: ['integrationA'], callback: expect.any(Function)}),
        );

        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'integrationA',
                category: 'notification',
                type: 'info',
                title: 'Notification rule deleted',
            }),
        );
    });

    it('deleteNotificationRule succeeds even when event log entry fails', async () => {
        mockWithRlsTransaction.mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const mockTx = {
                delete: () => ({
                    where: () => Promise.resolve(),
                }),
            };
            return params.callback(mockTx);
        });
        mockCreateEventLogEntry.mockRejectedValue(new Error('DB down'));

        await expect(notifications.deleteNotificationRule('rule-1', 'integrationA', ['integrationA'])).resolves.toBeUndefined();
    });
});
