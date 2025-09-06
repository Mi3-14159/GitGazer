import {deleteNotificationRule as ddeleteNotificationRule, getNotificationRulesBy, putNotificationRule} from '@/clients/dynamodb';
import {NotificationRule} from '@/types';

export const getNotificationRules = async (params: {integrationIds: string[]; limit?: number}): Promise<NotificationRule[]> => {
    const {integrationIds} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const rules = await getNotificationRulesBy({
        integrationIds,
    });

    return rules;
};

export const postNotificationRule = async (rule: NotificationRule, userGroups: string[]): Promise<NotificationRule> => {
    if (!rule.integrationId || !userGroups.includes(rule.integrationId)) {
        throw new Error('Unauthorized to create notification rule for this integration');
    }

    // Ensure the rule has an ID
    if (!rule.id) {
        rule.id = crypto.randomUUID();
    }

    const notificationRule = await putNotificationRule(rule);

    return notificationRule;
};

export const deleteNotificationRule = async (ruleId: string, integrationIds: string[]): Promise<boolean> => {
    const rules = await getNotificationRulesBy({
        integrationIds,
        id: ruleId,
    });

    if (rules.length === 0) {
        return false;
    }

    await ddeleteNotificationRule(rules[0].id!, rules[0].integrationId);

    return true;
};
