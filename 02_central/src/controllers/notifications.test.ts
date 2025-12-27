import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/clients/dynamodb', () => {
    return {
        getNotificationRulesBy: vi.fn(),
        putNotificationRule: vi.fn(),
        deleteNotificationRule: vi.fn(),
    };
});

let dynamodb: typeof import('@/clients/dynamodb');
let notifications: typeof import('./notifications');

describe('notifications controller', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        dynamodb = await import('@/clients/dynamodb');
        notifications = await import('./notifications');
    });

    it('getNotificationRules returns [] when integrationIds is empty', async () => {
        const out = await notifications.getNotificationRules({integrationIds: []});

        expect(out).toEqual([]);
        expect(dynamodb.getNotificationRulesBy).not.toHaveBeenCalled();
    });

    it('postNotificationRule throws when user is not in the integration group', async () => {
        await expect(
            notifications.postNotificationRule(
                {
                    integrationId: 'integrationA',
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
                ['integrationB'],
            ),
        ).rejects.toThrow('Unauthorized to create notification rule for this integration');
    });

    it('postNotificationRule generates an id when missing and persists rule', async () => {
        vi.stubGlobal('crypto', {
            randomUUID: () => 'uuid-123',
        } as any);

        (dynamodb.putNotificationRule as any).mockImplementation(async (rule: any) => {
            return {
                ...rule,
                created_at: 'now',
                updated_at: 'now',
            };
        });

        const rule: any = {
            integrationId: 'integrationA',
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

        const out = await notifications.postNotificationRule(rule, ['integrationA']);

        expect(dynamodb.putNotificationRule).toHaveBeenCalledTimes(1);
        expect(rule.id).toBe('uuid-123');
        expect(out.id).toBe('uuid-123');
        expect(out.integrationId).toBe('integrationA');
    });

    it('deleteNotificationRule returns false when no rule exists', async () => {
        (dynamodb.getNotificationRulesBy as any).mockResolvedValue([]);

        const out = await notifications.deleteNotificationRule('rule-1', ['integrationA']);

        expect(out).toBe(false);
        expect(dynamodb.deleteNotificationRule).not.toHaveBeenCalled();
    });

    it('deleteNotificationRule deletes and returns true when rule exists', async () => {
        (dynamodb.getNotificationRulesBy as any).mockResolvedValue([
            {
                id: 'rule-1',
                integrationId: 'integrationA',
            },
        ]);

        const out = await notifications.deleteNotificationRule('rule-1', ['integrationA']);

        expect(out).toBe(true);
        expect(dynamodb.deleteNotificationRule).toHaveBeenCalledWith('rule-1', 'integrationA');
    });
});
