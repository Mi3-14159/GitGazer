import {ForbiddenError} from '@aws-lambda-powertools/event-handler/http';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter, notificationRules} from '@gitgazer/db/schema';
import {NotificationRule, NotificationRuleUpdate} from '@gitgazer/db/types';
import {and, eq} from 'drizzle-orm';

const toNotificationRule = (row: typeof notificationRules.$inferSelect): NotificationRule => ({
    integrationId: row.integrationId,
    id: row.id,
    channels: row.channels,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    enabled: row.enabled,
    ignore_dependabot: row.ignore_dependabot,
    rule: row.rule,
});

export const getNotificationRules = async (params: {integrationIds: string[]; limit?: number}): Promise<NotificationRule[]> => {
    const {integrationIds} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const rows = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            return await tx.select().from(notificationRules);
        },
    });

    return rows.map(toNotificationRule);
};

export const upsertNotificationRule = async (params: {
    rule: NotificationRuleUpdate;
    integrationId: string;
    userIntegrationIds: string[];
    createOnly?: boolean;
    ruleId?: string;
}): Promise<NotificationRule> => {
    if (!params.userIntegrationIds.includes(params.integrationId)) {
        throw new ForbiddenError('Unauthorized to create/update notification rule for this integration');
    }

    const result = await withRlsTransaction({
        integrationIds: [params.integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            return await tx
                .insert(notificationRules)
                .values({
                    integrationId: params.integrationId,
                    id: params.ruleId,
                    channels: params.rule.channels,
                    enabled: params.rule.enabled,
                    ignore_dependabot: params.rule.ignore_dependabot,
                    rule: params.rule.rule,
                })
                .onConflictDoUpdate({
                    target: [notificationRules.integrationId, notificationRules.id],
                    set: {
                        channels: params.rule.channels,
                        enabled: params.rule.enabled,
                        ignore_dependabot: params.rule.ignore_dependabot,
                        rule: params.rule.rule,
                        updatedAt: new Date(),
                    },
                })
                .returning();
        },
    });

    return toNotificationRule(result[0]);
};

export const deleteNotificationRule = async (ruleId: string, integrationId: string, userIntegrationIds: string[]): Promise<void> => {
    if (!userIntegrationIds.includes(integrationId)) {
        throw new ForbiddenError('Unauthorized to delete notification rule for this integration');
    }

    await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            await tx.delete(notificationRules).where(and(eq(notificationRules.id, ruleId), eq(notificationRules.integrationId, integrationId)));
        },
    });
};
