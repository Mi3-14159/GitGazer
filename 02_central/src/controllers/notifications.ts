import {getNotificationRulesBy} from '@/clients/dynamodb';
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
