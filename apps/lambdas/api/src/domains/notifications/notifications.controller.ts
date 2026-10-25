import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter, notificationHandles, notificationRuleDestinations, notificationRules} from '@gitgazer/db/schema';
import {NotificationRule, NotificationRuleUpdate} from '@gitgazer/db/types';
import {BadRequestError} from '@aws-lambda-powertools/event-handler/http';
import {and, eq, inArray} from 'drizzle-orm';

import {createEventLogEntry} from '@gitgazer/backend-services/event-log.controller';
import {getLogger} from '@gitgazer/backend-core/logger';

const toNotificationRule = (row: typeof notificationRules.$inferSelect, handleIds: string[]): NotificationRule => ({
    integrationId: row.integrationId,
    id: row.id,
    label: row.label,
    handleIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    enabled: row.enabled,
    ignore_dependabot: row.ignore_dependabot,
    include_log_details: row.include_log_details,
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
            const rules = await tx.select().from(notificationRules);
            const destinations = await tx.select().from(notificationRuleDestinations);
            return {rules, destinations};
        },
    });

    // Rule ids are only unique per integration
    const ruleKey = (integrationId: string, ruleId: string) => `${integrationId}:${ruleId}`;
    const handleIdsByRule = new Map<string, string[]>();
    for (const {integrationId, ruleId, handleId} of rows.destinations) {
        const key = ruleKey(integrationId, ruleId);
        handleIdsByRule.set(key, [...(handleIdsByRule.get(key) ?? []), handleId]);
    }

    return rows.rules.map((row) => toNotificationRule(row, handleIdsByRule.get(ruleKey(row.integrationId, row.id)) ?? []));
};

export const upsertNotificationRule = async (params: {
    rule: NotificationRuleUpdate;
    integrationId: string;
    createOnly?: boolean;
    ruleId?: string;
}): Promise<NotificationRule> => {
    // Omitted so the DB default applies on insert and the stored value is kept on update.
    const includeLogDetails = params.rule.include_log_details === undefined ? {} : {include_log_details: params.rule.include_log_details};
    const handleIds = [...new Set(params.rule.handleIds)];
    const result = await withRlsTransaction({
        integrationIds: [params.integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            if (handleIds.length > 0) {
                const known = await tx
                    .select({handleId: notificationHandles.handleId})
                    .from(notificationHandles)
                    .where(and(eq(notificationHandles.integrationId, params.integrationId), inArray(notificationHandles.handleId, handleIds)));
                if (known.length !== handleIds.length) {
                    throw new BadRequestError('Unknown notification handle');
                }
            }

            const [row] = await tx
                .insert(notificationRules)
                .values({
                    integrationId: params.integrationId,
                    id: params.ruleId,
                    label: params.rule.label,
                    channels: [],
                    enabled: params.rule.enabled,
                    ignore_dependabot: params.rule.ignore_dependabot,
                    ...includeLogDetails,
                    rule: params.rule.rule,
                })
                .onConflictDoUpdate({
                    target: [notificationRules.integrationId, notificationRules.id],
                    set: {
                        label: params.rule.label,
                        channels: [],
                        enabled: params.rule.enabled,
                        ignore_dependabot: params.rule.ignore_dependabot,
                        ...includeLogDetails,
                        rule: params.rule.rule,
                        updatedAt: new Date(),
                    },
                })
                .returning();

            await tx
                .delete(notificationRuleDestinations)
                .where(and(eq(notificationRuleDestinations.integrationId, params.integrationId), eq(notificationRuleDestinations.ruleId, row.id)));
            if (handleIds.length > 0) {
                await tx
                    .insert(notificationRuleDestinations)
                    .values(handleIds.map((handleId) => ({integrationId: params.integrationId, ruleId: row.id, handleId})));
            }

            return row;
        },
    });

    const saved = toNotificationRule(result, handleIds);
    const action = params.createOnly ? 'created' : 'updated';
    const filterDesc = describeRuleFilter(params.rule.rule);

    try {
        await createEventLogEntry({
            integrationId: params.integrationId,
            category: 'notification',
            type: 'info',
            title: `Notification rule ${action}`,
            message: `Notification rule "${params.rule.label}" for ${filterDesc} was ${action} (destinations: ${handleIds.length}, enabled: ${params.rule.enabled})`,
            metadata: {integrationId: params.integrationId},
        });
    } catch (error) {
        getLogger().error('Failed to create event log entry for notification rule upsert', error as Error);
    }

    return saved;
};

export const deleteNotificationRule = async (ruleId: string, integrationId: string): Promise<void> => {
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
