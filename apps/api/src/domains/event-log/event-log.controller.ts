import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {eventLogEntries, gitgazerWriter, repositories} from '@gitgazer/db/schema';
import type {
    EventLogCategory,
    EventLogCursor,
    EventLogEntryInsert,
    EventLogEntryMetadata,
    EventLogEntryRow,
    EventLogFilters,
    EventLogResponse,
    EventLogStats,
    EventLogType,
    FilterMode,
} from '@gitgazer/db/types';
import {and, count, desc, eq, ilike, inArray, lt, notInArray, or, sql, type SQLWrapper} from 'drizzle-orm';

/**
 * Builds an `IN` (include) or `NOT IN` (exclude) condition for a multi-select
 * filter. A filter is always one direction or the other, never both.
 */
const setCondition = <T>(column: SQLWrapper, values: T[], mode?: FilterMode) =>
    mode === 'exclude' ? notInArray(column, values) : inArray(column, values);

export const getEventLogEntries = async (params: {
    integrationIds: string[];
    cursor?: EventLogCursor;
    filters?: EventLogFilters;
}): Promise<EventLogResponse> => {
    const {integrationIds, cursor, filters} = params;
    if (integrationIds.length === 0) return {items: [], cursor: undefined};

    const limit = Math.min(filters?.limit ?? 50, 100);

    return await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const conditions = [];

            // Keyset pagination: (createdAt, id) < (cursorCreatedAt, cursorId)
            if (cursor?.createdAt && cursor?.id) {
                const cursorDate = new Date(cursor.createdAt);
                if (!isNaN(cursorDate.getTime())) {
                    conditions.push(
                        or(
                            lt(eventLogEntries.createdAt, cursorDate),
                            and(eq(eventLogEntries.createdAt, cursorDate), lt(eventLogEntries.id, cursor.id)),
                        )!,
                    );
                }
            }

            if (filters?.type?.length) {
                conditions.push(setCondition(eventLogEntries.type, filters.type, filters.typeMode));
            }
            if (filters?.category?.length) {
                conditions.push(setCondition(eventLogEntries.category, filters.category, filters.categoryMode));
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
                conditions.push(setCondition(sql`(metadata->>'repositoryId')::BIGINT`, filters.repositoryIds, filters.repositoryIdsMode));
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
                conditions.push(
                    setCondition(
                        sql`(${eventLogEntries.metadata}->>'repositoryId')::BIGINT`,
                        repoRows.map((r) => r.id),
                        filters.topicsMode,
                    ),
                );
            }
            if (filters?.integrationIds?.length) {
                conditions.push(setCondition(eventLogEntries.integrationId, filters.integrationIds, filters.integrationIdsMode));
            }

            const rows = await tx
                .select()
                .from(eventLogEntries)
                .where(conditions.length > 0 ? and(...conditions) : undefined)
                .orderBy(desc(eventLogEntries.createdAt), desc(eventLogEntries.id))
                .limit(limit);

            const last = rows[rows.length - 1];
            const nextCursor: EventLogCursor | undefined =
                rows.length >= limit && last ? {createdAt: last.createdAt.toISOString(), id: last.id} : undefined;

            return {items: rows, cursor: nextCursor};
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
