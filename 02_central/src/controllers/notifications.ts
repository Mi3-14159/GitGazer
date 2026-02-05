import {deleteNotificationRule as ddeleteNotificationRule, getNotificationRulesBy, putNotificationRule} from '@/clients/dynamodb';
import {UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {NotificationRule, NotificationRuleUpdate} from '@common/types';

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

export const upsertNotificationRule = async (params: {
    rule: NotificationRuleUpdate;
    integrationId: string;
    userIntegrationIds: string[];
    createOnly?: boolean;
    ruleId?: string;
}): Promise<NotificationRule> => {
    if (!params.userIntegrationIds.includes(params.integrationId)) {
        throw new Error('Unauthorized to create notification rule for this integration');
    }

    return await putNotificationRule(
        {
            ...params.rule,
            integrationId: params.integrationId,
            id: params.createOnly ? crypto.randomUUID() : params.ruleId,
        },
        params.createOnly,
    );
};

export const deleteNotificationRule = async (ruleId: string, integrationId: string, userIntegrationIds: string[]): Promise<void> => {
    if (!userIntegrationIds.includes(integrationId)) {
        throw new UnauthorizedError('Unauthorized to delete notification rule for this integration');
    }

    await ddeleteNotificationRule(ruleId, integrationId);
};
