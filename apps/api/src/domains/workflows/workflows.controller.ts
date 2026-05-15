import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {workflowRunRelations} from '@gitgazer/db/queries';
import {repositories, workflowRuns} from '@gitgazer/db/schema';
import {FilterValueResult, FilterValuesParams, GetWorkflowsResponse, PaginationCursor, WorkflowFilters} from '@gitgazer/db/types';
import {and, desc, eq, gte, ilike, inArray, lt, lte, or, sql, SQL} from 'drizzle-orm';

type WorkflowsParams = {
    integrationIds: string[];
    limit?: number;
    cursor?: PaginationCursor;
    filters?: WorkflowFilters;
};

export const getWorkflows = async ({integrationIds, limit, cursor, filters}: WorkflowsParams): Promise<GetWorkflowsResponse> => {
    if (!integrationIds.length) return {items: [], cursor: undefined};

    const effectiveLimit = Math.min(limit ?? 100, 100);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const conditions: SQL[] = [];

            // Keyset pagination: (createdAt, id) < (cursorCreatedAt, cursorId)
            if (cursor?.createdAt && cursor?.id != null) {
                const cursorDate = new Date(cursor.createdAt);
                conditions.push(
                    or(lt(workflowRuns.createdAt, cursorDate), and(eq(workflowRuns.createdAt, cursorDate), lt(workflowRuns.id, cursor.id)))!,
                );
            }

            // Column filters
            if (filters?.workflow?.length) {
                conditions.push(inArray(workflowRuns.name, filters.workflow));
            }
            if (filters?.repository?.length) {
                conditions.push(
                    inArray(
                        workflowRuns.repositoryId,
                        tx.select({id: repositories.id}).from(repositories).where(inArray(repositories.name, filters.repository)),
                    ),
                );
            }
            if (filters?.branch?.length) {
                conditions.push(inArray(workflowRuns.headBranch, filters.branch));
            }
            if (filters?.status?.length) {
                const statusValues = filters.status as (typeof workflowRuns.conclusion.enumValues)[number][];
                conditions.push(or(inArray(workflowRuns.conclusion, statusValues), inArray(workflowRuns.status, filters.status))!);
            }
            if (filters?.actor?.length) {
                conditions.push(inArray(workflowRuns.headCommitAuthorName, filters.actor));
            }
            if (filters?.commit?.length) {
                conditions.push(inArray(workflowRuns.headCommitMessage, filters.commit));
            }
            if (filters?.run_number?.length) {
                const nums = filters.run_number.map(Number).filter((n) => !isNaN(n));
                if (nums.length) {
                    conditions.push(inArray(workflowRuns.runAttempt, nums));
                }
            }
            if (filters?.topics?.length) {
                const topicParams = sql.join(
                    filters.topics.map((t) => sql`${t}`),
                    sql`, `,
                );
                conditions.push(
                    inArray(
                        workflowRuns.repositoryId,
                        tx
                            .select({id: repositories.id})
                            .from(repositories)
                            .where(sql`${repositories.topics} ?| array[${topicParams}]`),
                    ),
                );
            }

            // Date range filter
            if (filters?.window) {
                const now = new Date();
                let from: Date;
                switch (filters.window) {
                    case '1h':
                        from = new Date(now.getTime() - 60 * 60 * 1000);
                        break;
                    case '24h':
                        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                        break;
                    case '7d':
                        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case '30d':
                        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        break;
                    default:
                        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                        break;
                }
                conditions.push(gte(workflowRuns.createdAt, from));
                conditions.push(lte(workflowRuns.createdAt, now));
            } else {
                if (filters?.created_from) {
                    conditions.push(gte(workflowRuns.createdAt, new Date(filters.created_from)));
                }
                if (filters?.created_to) {
                    conditions.push(lte(workflowRuns.createdAt, new Date(filters.created_to)));
                }
            }

            const runs = await tx.query.workflowRuns.findMany({
                with: workflowRunRelations,
                ...(conditions.length ? {where: and(...conditions)} : {}),
                orderBy: [desc(workflowRuns.createdAt), desc(workflowRuns.id)],
                limit: effectiveLimit,
            });

            const lastItem = runs[runs.length - 1];
            const nextCursor: PaginationCursor | undefined =
                runs.length >= effectiveLimit && lastItem ? {createdAt: lastItem.createdAt.toISOString(), id: lastItem.id} : undefined;

            return {items: runs, cursor: nextCursor};
        },
    });
};

function buildDateConditions(params: Pick<FilterValuesParams, 'window' | 'created_from' | 'created_to'>): SQL[] {
    const conditions: SQL[] = [];
    if (params.window) {
        const now = new Date();
        const ms: Record<string, number> = {'1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000};
        const from = new Date(now.getTime() - (ms[params.window] ?? 86_400_000));
        conditions.push(gte(workflowRuns.createdAt, from));
        conditions.push(lte(workflowRuns.createdAt, now));
    } else {
        if (params.created_from) conditions.push(gte(workflowRuns.createdAt, new Date(params.created_from)));
        if (params.created_to) conditions.push(lte(workflowRuns.createdAt, new Date(params.created_to)));
    }
    return conditions;
}

export const getWorkflowFilterValues = async ({
    integrationIds,
    column,
    search,
    limit = 50,
    ...dateParams
}: FilterValuesParams): Promise<FilterValueResult[]> => {
    if (!integrationIds.length) return [];

    return withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const effectiveLimit = Math.min(limit, 100);
            const searchPattern = search ? `%${search}%` : undefined;
            const dateConditions = buildDateConditions(dateParams);

            if (column === 'topics') {
                const conditions: SQL[] = [...dateConditions];
                if (searchPattern) {
                    conditions.push(sql`t.topic ILIKE ${searchPattern}`);
                }
                // Date conditions reference workflowRuns, so join through repositories
                const hasDateFilter = dateConditions.length > 0;
                const joinClause = hasDateFilter
                    ? sql`INNER JOIN ${workflowRuns} ON ${workflowRuns.repositoryId} = ${repositories.id} AND ${workflowRuns.integrationId} = ${repositories.integrationId}`
                    : sql``;
                const whereClause = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
                const rows = await tx.execute(
                    sql`SELECT t.topic AS value, COUNT(DISTINCT ${repositories.id})::int AS count
                        FROM ${repositories}
                        CROSS JOIN LATERAL jsonb_array_elements_text(${repositories.topics}) AS t(topic)
                        ${joinClause}
                        ${whereClause}
                        GROUP BY t.topic
                        ORDER BY count DESC, t.topic
                        LIMIT ${effectiveLimit}`,
                );
                return (rows.rows ?? []).map((r: any) => ({value: String(r.value), count: Number(r.count)}));
            }

            if (column === 'repository') {
                const conditions: SQL[] = [...dateConditions];
                if (searchPattern) {
                    conditions.push(ilike(repositories.name, searchPattern));
                }
                const rows = await tx
                    .select({
                        value: repositories.name,
                        count: sql<number>`COUNT(${workflowRuns.id})::int`,
                    })
                    .from(repositories)
                    .innerJoin(
                        workflowRuns,
                        and(eq(workflowRuns.repositoryId, repositories.id), eq(workflowRuns.integrationId, repositories.integrationId)),
                    )
                    .where(conditions.length ? and(...conditions) : undefined)
                    .groupBy(repositories.name)
                    .orderBy(sql`count DESC`, repositories.name)
                    .limit(effectiveLimit);
                return rows;
            }

            // Map column names to actual DB columns
            const columnMap = {
                workflow: workflowRuns.name,
                branch: workflowRuns.headBranch,
                actor: workflowRuns.headCommitAuthorName,
                commit: workflowRuns.headCommitMessage,
            } as const;

            if (column === 'status') {
                // Status combines conclusion and status fields
                const conditions: SQL[] = [...dateConditions];
                if (searchPattern) {
                    conditions.push(sql`COALESCE(${workflowRuns.conclusion}, ${workflowRuns.status}) ILIKE ${searchPattern}`);
                }
                const rows = await tx
                    .select({
                        value: sql<string>`COALESCE(${workflowRuns.conclusion}, ${workflowRuns.status})`,
                        count: sql<number>`COUNT(*)::int`,
                    })
                    .from(workflowRuns)
                    .where(conditions.length ? and(...conditions) : undefined)
                    .groupBy(sql`COALESCE(${workflowRuns.conclusion}, ${workflowRuns.status})`)
                    .orderBy(sql`count DESC`)
                    .limit(effectiveLimit);
                return rows.filter((r) => r.value);
            }

            const dbColumn = columnMap[column as keyof typeof columnMap];
            if (!dbColumn) return [];

            const conditions: SQL[] = [...dateConditions];
            if (searchPattern) {
                conditions.push(ilike(dbColumn, searchPattern));
            }

            const rows = await tx
                .select({
                    value: dbColumn,
                    count: sql<number>`COUNT(*)::int`,
                })
                .from(workflowRuns)
                .where(conditions.length ? and(...conditions) : undefined)
                .groupBy(dbColumn)
                .orderBy(sql`count DESC`, dbColumn)
                .limit(effectiveLimit);
            return rows.filter((r) => r.value);
        },
    });
};
