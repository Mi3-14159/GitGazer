import {ForbiddenError} from '@aws-lambda-powertools/event-handler/http';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter, notificationRules} from '@gitgazer/db/schema';
import {NotificationRule, NotificationRuleUpdate} from '@gitgazer/db/types';
import {and, eq} from 'drizzle-orm';

import {createEventLogEntry} from '@/domains/event-log/event-log.controller';
import {getLogger} from '@/shared/logger';

const toNotificationRule = (row: typeof notificationRules.$inferSelect): NotificationRule => ({
    integrationId: row.integrationId,
    id: row.id,
    label: row.label,
    channels: row.channels,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    enabled: row.enabled,
    ignore_dependabot: row.ignore_dependabot,
    rule: row.rule,
});

const describeRuleFilter = (rule: NotificationRuleUpdate['rule']): string => {
    const parts = [rule.owner, rule.repository_name, rule.workflow_name, rule.head_branch];
    const hasAnyFilter = parts.some(Boolean) || (rule.topics && rule.topics.length > 0);
    if (!hasAnyFilter) return 'all (no filters)';
    const base = parts.map((v) => v || 'any').join('/');
    if (rule.topics && rule.topics.length > 0) {
        return `${base} [topics: ${rule.topics.join(', ')}]`;
    }
    return base;
};

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
                    label: params.rule.label,
                    channels: params.rule.channels,
                    enabled: params.rule.enabled,
                    ignore_dependabot: params.rule.ignore_dependabot,
                    rule: params.rule.rule,
                })
                .onConflictDoUpdate({
                    target: [notificationRules.integrationId, notificationRules.id],
                    set: {
                        label: params.rule.label,
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

    const saved = toNotificationRule(result[0]);
    const action = params.createOnly ? 'created' : 'updated';
    const filterDesc = describeRuleFilter(params.rule.rule);
    const channels = params.rule.channels.map((c) => c.type).join(', ');

    try {
        await createEventLogEntry({
            integrationId: params.integrationId,
            category: 'notification',
            type: 'info',
            title: `Notification rule ${action}`,
            message: `Notification rule "${params.rule.label}" for ${filterDesc} was ${action} (channels: ${channels}, enabled: ${params.rule.enabled})`,
            metadata: {integrationId: params.integrationId},
        });
    } catch (error) {
        getLogger().error('Failed to create event log entry for notification rule upsert', error as Error);
    }

    return saved;
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

    try {
        await createEventLogEntry({
            integrationId,
            category: 'notification',
            type: 'info',
            title: 'Notification rule deleted',
            message: 'A notification rule was deleted',
            metadata: {integrationId},
        });
    } catch (error) {
        getLogger().error('Failed to create event log entry for notification rule deletion', error as Error);
    }
};
