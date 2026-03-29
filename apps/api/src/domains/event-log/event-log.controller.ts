import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {eventLogEntries, gitgazerWriter, repositories} from '@gitgazer/db/schema';
import type {
    EventLogCategory,
    EventLogEntryInsert,
    EventLogEntryMetadata,
    EventLogEntryRow,
    EventLogFilters,
    EventLogStats,
    EventLogType,
} from '@gitgazer/db/types';
import {and, count, eq, ilike, or, sql} from 'drizzle-orm';

export const getEventLogEntries = async (params: {integrationIds: string[]; filters?: EventLogFilters}): Promise<EventLogEntryRow[]> => {
    const {integrationIds, filters} = params;
    if (integrationIds.length === 0) return [];

    const limit = Math.min(filters?.limit ?? 50, 100);
    const offset = filters?.offset ?? 0;

    return await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const conditions = [];

            if (filters?.type) {
                conditions.push(eq(eventLogEntries.type, filters.type));
            }
            if (filters?.category) {
                conditions.push(eq(eventLogEntries.category, filters.category));
            }
            if (filters?.read !== undefined) {
                conditions.push(eq(eventLogEntries.read, filters.read));
            }
            if (filters?.search) {
                const escaped = filters.search.replace(/[%_\\]/g, '\\$&');
                const term = `%${escaped}%`;
                conditions.push(or(ilike(eventLogEntries.title, term), ilike(eventLogEntries.message, term))!);
            }
            if (filters?.repositoryIds?.length) {
                const repoIdParams = sql.join(
                    filters.repositoryIds.map((id) => sql`${id}`),
                    sql`, `,
                );
                conditions.push(sql`(${eventLogEntries.metadata}->>'repositoryId')::BIGINT IN (${repoIdParams})`);
            }
            if (filters?.topics?.length) {
                const topicParams = sql.join(
                    filters.topics.map((t) => sql`${t}`),
                    sql`, `,
                );
                const repoRows = await tx
                    .select({id: sql`${repositories.id}`})
                    .from(repositories)
                    .where(sql`${repositories.topics} ?| array[${topicParams}]`);
                const repoIdParams = sql.join(
                    repoRows.map((r) => sql`${r.id}`),
                    sql`, `,
                );
                conditions.push(sql`(${eventLogEntries.metadata}->>'repositoryId')::BIGINT IN (${repoIdParams})`);
            }

            const rows = await tx
                .select()
                .from(eventLogEntries)
                .where(conditions.length > 0 ? and(...conditions) : undefined)
                .orderBy(sql`${eventLogEntries.createdAt} desc`)
                .limit(limit)
                .offset(offset);

            return rows;
        },
    });
};

export const getEventLogStats = async (params: {integrationIds: string[]}): Promise<EventLogStats> => {
    const {integrationIds} = params;
    if (integrationIds.length === 0) return {total: 0, unread: 0, read: 0};

    return await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const [result] = await tx
                .select({
                    total: count(),
                    unread: count(sql`CASE WHEN ${eventLogEntries.read} = false THEN 1 END`),
                    read: count(sql`CASE WHEN ${eventLogEntries.read} = true THEN 1 END`),
                })
                .from(eventLogEntries);

            return {
                total: result.total,
                unread: result.unread,
                read: result.read,
            };
        },
    });
};

export const toggleEventLogRead = async (params: {id: string; integrationIds: string[]; read: boolean}): Promise<EventLogEntryRow | null> => {
    const {id, integrationIds, read} = params;

    const rows = await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            return await tx
                .update(eventLogEntries)
                .set({read})
                .where(and(eq(eventLogEntries.id, id)))
                .returning();
        },
    });

    return rows.length > 0 ? rows[0] : null;
};

export const markAllEventLogRead = async (params: {integrationIds: string[]}): Promise<number> => {
    const {integrationIds} = params;
    if (integrationIds.length === 0) return 0;

    return await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const result = await tx
                .update(eventLogEntries)
                .set({read: true})
                .where(eq(eventLogEntries.read, false))
                .returning({id: eventLogEntries.id});

            return result.length;
        },
    });
};

export const createEventLogEntry = async (params: {
    integrationId: string;
    category: EventLogCategory;
    type: EventLogType;
    title: string;
    message: string;
    metadata?: EventLogEntryMetadata;
}): Promise<EventLogEntryInsert> => {
    const rows = await withRlsTransaction({
        integrationIds: [params.integrationId],
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            return await tx
                .insert(eventLogEntries)
                .values({
                    integrationId: params.integrationId,
                    category: params.category,
                    type: params.type,
                    title: params.title,
                    message: params.message,
                    metadata: params.metadata,
                })
                .returning();
        },
    });

    return rows[0];
};
