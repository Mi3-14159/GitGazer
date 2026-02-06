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

    it('upsertNotificationRule generates an id when creating and persists rule', async () => {
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

        expect(dynamodb.putNotificationRule).toHaveBeenCalledTimes(1);
        expect(out.id).toBe('uuid-123');
        expect(out.integrationId).toBe('integrationA');
    });

    it('deleteNotificationRule throws when user is not in the integration group', async () => {
        await expect(notifications.deleteNotificationRule('rule-1', 'integrationA', ['integrationB'])).rejects.toThrow(
            'Unauthorized to delete notification rule for this integration',
        );

        expect(dynamodb.deleteNotificationRule).not.toHaveBeenCalled();
    });

    it('deleteNotificationRule calls delete when authorized', async () => {
        await notifications.deleteNotificationRule('rule-1', 'integrationA', ['integrationA']);

        expect(dynamodb.deleteNotificationRule).toHaveBeenCalledWith('rule-1', 'integrationA');
    });
});
