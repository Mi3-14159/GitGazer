import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter, notificationHandles, notificationRuleDestinations, notificationRules} from '@gitgazer/db/schema';
import {isNotificationRuleUpdate, NotificationRule, NotificationRuleUpdate} from '@gitgazer/db/types';
import {BadRequestError, NotFoundError} from '@/shared/errors';
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

    // One statement, so a concurrent rule edit cannot pair old filters with new handles
    const rules = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => await tx.query.notificationRules.findMany({with: {destinations: true}}),
    });

    return rules.map((row) =>
        toNotificationRule(
            row,
            row.destinations.map((d) => d.handleId),
        ),
    );
};

export type ChangeSource = 'mcp';

const viaSuffix = (source?: ChangeSource): string => (source === 'mcp' ? ' via MCP' : '');

const writeRule = async (tx: RdsTransaction, params: {rule: NotificationRuleUpdate; integrationId: string; ruleId?: string}) => {
    // Omitted so the DB default applies on insert and the stored value is kept on update.
    const includeLogDetails = params.rule.include_log_details === undefined ? {} : {include_log_details: params.rule.include_log_details};
    const handleIds = [...new Set(params.rule.handleIds)];

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
            enabled: params.rule.enabled,
            ignore_dependabot: params.rule.ignore_dependabot,
            ...includeLogDetails,
            rule: params.rule.rule,
        })
        .onConflictDoUpdate({
            target: [notificationRules.integrationId, notificationRules.id],
            set: {
                label: params.rule.label,
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

    return {row, handleIds};
};

const logRuleChange = async (params: {rule: NotificationRuleUpdate; integrationId: string; action: 'created' | 'updated'; source?: ChangeSource}) => {
    const filterDesc = describeRuleFilter(params.rule.rule);
    const destinations = new Set(params.rule.handleIds).size;

    try {
        await createEventLogEntry({
            integrationId: params.integrationId,
            category: 'notification',
            type: 'info',
            title: `Notification rule ${params.action}`,
            message: `Notification rule "${params.rule.label}" for ${filterDesc} was ${params.action}${viaSuffix(params.source)} (destinations: ${destinations}, enabled: ${params.rule.enabled})`,
            metadata: {integrationId: params.integrationId},
        });
    } catch (error) {
        getLogger().error('Failed to create event log entry for notification rule upsert', error as Error);
    }
};

export const upsertNotificationRule = async (params: {
    rule: NotificationRuleUpdate;
    integrationId: string;
    createOnly?: boolean;
    ruleId?: string;
    source?: ChangeSource;
}): Promise<NotificationRule> => {
    const {row, handleIds} = await withRlsTransaction({
        integrationIds: [params.integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => await writeRule(tx, params),
    });

    await logRuleChange({...params, action: params.createOnly ? 'created' : 'updated'});

    return toNotificationRule(row, handleIds);
};

export const updateNotificationRule = async (params: {
    integrationId: string;
    ruleId: string;
    changes: Partial<NotificationRuleUpdate>;
    source?: ChangeSource;
}): Promise<NotificationRule> => {
    const {integrationId, ruleId} = params;
    const {merged, row, handleIds} = await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const [stored] = await tx
                .select()
                .from(notificationRules)
                .where(and(eq(notificationRules.id, ruleId), eq(notificationRules.integrationId, integrationId)))
                .for('update');
            if (!stored) {
                throw new NotFoundError('Notification rule not found');
            }

            const destinations = await tx
                .select({handleId: notificationRuleDestinations.handleId})
                .from(notificationRuleDestinations)
                .where(and(eq(notificationRuleDestinations.integrationId, integrationId), eq(notificationRuleDestinations.ruleId, ruleId)));

            const merged = {
                label: stored.label,
                handleIds: destinations.map((d) => d.handleId),
                enabled: stored.enabled,
                ignore_dependabot: stored.ignore_dependabot,
                include_log_details: stored.include_log_details,
                rule: stored.rule,
                ...params.changes,
            };
            if (!isNotificationRuleUpdate(merged)) {
                throw new BadRequestError('Invalid notification rule update');
            }

            return {merged, ...(await writeRule(tx, {rule: merged, integrationId, ruleId}))};
        },
    });

    await logRuleChange({rule: merged, integrationId, action: 'updated', source: params.source});

    return toNotificationRule(row, handleIds);
};

export const deleteNotificationRule = async (ruleId: string, integrationId: string, source?: ChangeSource): Promise<boolean> => {
    const deleted = await withRlsTransaction({
        integrationIds: [integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) =>
            await tx
                .delete(notificationRules)
                .where(and(eq(notificationRules.id, ruleId), eq(notificationRules.integrationId, integrationId)))
                .returning({id: notificationRules.id}),
    });
    if (deleted.length === 0) {
        return false;
    }

    try {
        await createEventLogEntry({
            integrationId,
            category: 'notification',
            type: 'info',
            title: 'Notification rule deleted',
            message: `A notification rule was deleted${viaSuffix(source)}`,
            metadata: {integrationId},
        });
    } catch (error) {
        getLogger().error('Failed to create event log entry for notification rule deletion', error as Error);
    }

    return true;
};
