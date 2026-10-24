import {isNotificationRule, isNotificationRuleUpdate} from '@gitgazer/db/types';
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
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({
    createEventLogEntry: (...args: any[]) => mockCreateEventLogEntry(...args),
}));

vi.mock('@gitgazer/backend-core/logger', () => ({
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
                                        label: 'CI alerts',
                                        channels: [],
                                        enabled: true,
                                        ignore_dependabot: false,
                                        rule: {owner: 'o', repository_name: 'r', workflow_name: 'w', head_branch: 'b', topics: []},
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
            label: 'CI alerts',
            enabled: true,
            channels: [],
            ignore_dependabot: false,
            rule: {
                owner: 'o',
                repository_name: 'r',
                workflow_name: 'w',
                head_branch: 'b',
                topics: [],
            },
        };

        const out = await notifications.upsertNotificationRule({
            rule,
            integrationId: 'integrationA',
            createOnly: true,
        });

        expect(mockWithRlsTransaction).toHaveBeenCalledTimes(1);
        expect(out.id).toBe('uuid-123');
        expect(out.integrationId).toBe('integrationA');
        expect(out.label).toBe('CI alerts');

        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'integrationA',
                category: 'notification',
                type: 'info',
                title: 'Notification rule created',
                message: expect.stringContaining('o/r/w/b'),
            }),
        );
        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('"CI alerts"'),
            }),
        );
    });

    it('upsertNotificationRule includes topics in event log message when topics are set', async () => {
        const now = new Date();
        mockWithRlsTransaction.mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const mockTx = {
                insert: () => ({
                    values: () => ({
                        onConflictDoUpdate: () => ({
                            returning: () =>
                                Promise.resolve([
                                    {
                                        id: 'uuid-topics',
                                        integrationId: 'integrationA',
                                        label: 'Topic rule',
                                        channels: [],
                                        enabled: true,
                                        ignore_dependabot: false,
                                        rule: {
                                            owner: 'o',
                                            repository_name: 'r',
                                            workflow_name: 'w',
                                            head_branch: 'b',
                                            topics: ['frontend', 'backend'],
                                        },
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

        const out = await notifications.upsertNotificationRule({
            rule: {
                label: 'Topic rule',
                enabled: true,
                channels: [],
                ignore_dependabot: false,
                rule: {owner: 'o', repository_name: 'r', workflow_name: 'w', head_branch: 'b', topics: ['frontend', 'backend']},
            } as any,
            integrationId: 'integrationA',
            createOnly: true,
        });

        expect(out.id).toBe('uuid-topics');
        expect(out.rule.topics).toEqual(['frontend', 'backend']);

        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('[topics: frontend, backend]'),
            }),
        );
    });

    it('getNotificationRules passes through rule as-is', async () => {
        const now = new Date();
        mockWithRlsTransaction.mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const mockTx = {
                select: () => ({
                    from: () =>
                        Promise.resolve([
                            {
                                id: 'uuid-old',
                                integrationId: 'integrationA',
                                label: 'Old rule',
                                channels: [],
                                enabled: true,
                                ignore_dependabot: false,
                                rule: {head_branch: 'main'},
                                createdAt: now,
                                updatedAt: now,
                            },
                        ]),
                }),
            };
            return params.callback(mockTx);
        });

        const out = await notifications.getNotificationRules({integrationIds: ['integrationA']});

        expect(out).toHaveLength(1);
        expect(out[0].rule).toEqual({head_branch: 'main'});
        expect(out[0].label).toBe('Old rule');
        expect(out[0].rule.owner).toBeUndefined();
        expect(out[0].rule.repository_name).toBeUndefined();
        expect(out[0].rule.workflow_name).toBeUndefined();
        expect(out[0].rule.topics).toBeUndefined();
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
                                        label: 'Failing rule',
                                        channels: [],
                                        enabled: true,
                                        ignore_dependabot: false,
                                        rule: {topics: []},
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
                label: 'Failing rule',
                enabled: true,
                channels: [],
                ignore_dependabot: false,
                rule: {topics: []},
            } as any,
            integrationId: 'integrationA',
            createOnly: true,
        });

        expect(out.id).toBe('uuid-456');
    });

    describe('include_log_details', () => {
        const now = new Date();
        const savedRow = {
            id: 'uuid-1',
            integrationId: 'integrationA',
            label: 'CI alerts',
            channels: [],
            enabled: true,
            ignore_dependabot: false,
            include_log_details: true,
            rule: {topics: []},
            createdAt: now,
            updatedAt: now,
        };

        const captureUpsert = () => {
            const captured: {values?: any; set?: any} = {};
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                const mockTx = {
                    insert: () => ({
                        values: (v: any) => {
                            captured.values = v;
                            return {
                                onConflictDoUpdate: (c: any) => {
                                    captured.set = c.set;
                                    return {returning: () => Promise.resolve([savedRow])};
                                },
                            };
                        },
                    }),
                };
                return params.callback(mockTx);
            });
            return captured;
        };

        const baseRule = {label: 'CI alerts', enabled: true, channels: [], ignore_dependabot: false, rule: {topics: []}};

        it('toNotificationRule maps include_log_details', async () => {
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) =>
                params.callback({select: () => ({from: () => Promise.resolve([{...savedRow, include_log_details: false}, savedRow])})}),
            );

            const out = await notifications.getNotificationRules({integrationIds: ['integrationA']});

            expect(out.map((r) => r.include_log_details)).toEqual([false, true]);
        });

        it('upsert passes include_log_details to values and set when provided', async () => {
            const captured = captureUpsert();

            await notifications.upsertNotificationRule({
                rule: {...baseRule, include_log_details: false} as any,
                integrationId: 'integrationA',
            });

            expect(captured.values.include_log_details).toBe(false);
            expect(captured.set.include_log_details).toBe(false);
        });

        it('upsert omits include_log_details from set when undefined', async () => {
            const captured = captureUpsert();

            await notifications.upsertNotificationRule({rule: baseRule as any, integrationId: 'integrationA'});

            expect(captured.values).not.toHaveProperty('include_log_details');
            expect(captured.set).not.toHaveProperty('include_log_details');
        });
    });

    it('deleteNotificationRule calls delete and creates event log entry', async () => {
        mockWithRlsTransaction.mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const mockTx = {
                delete: () => ({
                    where: () => Promise.resolve(),
                }),
            };
            return params.callback(mockTx);
        });

        await notifications.deleteNotificationRule('rule-1', 'integrationA');

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

        await expect(notifications.deleteNotificationRule('rule-1', 'integrationA')).resolves.toBeUndefined();
    });
});

describe('isNotificationRuleUpdate include_log_details', () => {
    const base = {
        label: 'r',
        channels: [{type: 'SLACK', webhook_url: 'https://hooks.slack.com/x'}],
        enabled: true,
        ignore_dependabot: false,
        rule: {},
    };

    it('accepts a missing include_log_details', () => expect(isNotificationRuleUpdate(base)).toBe(true));
    it('accepts a boolean include_log_details', () => expect(isNotificationRuleUpdate({...base, include_log_details: false})).toBe(true));
    it('rejects a non-boolean include_log_details', () => expect(isNotificationRuleUpdate({...base, include_log_details: 'yes'})).toBe(false));
});

describe('isNotificationRule include_log_details', () => {
    const base = {
        integrationId: 'int-1',
        label: 'r',
        channels: [{type: 'SLACK', webhook_url: 'https://hooks.slack.com/x'}],
        createdAt: '2026-10-24T00:00:00.000Z',
        updatedAt: '2026-10-24T00:00:00.000Z',
        enabled: true,
        ignore_dependabot: false,
        rule: {},
    };

    it('accepts a boolean include_log_details', () => expect(isNotificationRule({...base, include_log_details: true})).toBe(true));
    it('rejects a missing include_log_details', () => expect(isNotificationRule(base)).toBe(false));
    it('rejects a non-boolean include_log_details', () => expect(isNotificationRule({...base, include_log_details: 'yes'})).toBe(false));
});
