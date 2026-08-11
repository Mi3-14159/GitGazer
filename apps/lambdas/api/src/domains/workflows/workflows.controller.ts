import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {workflowRunRelations} from '@gitgazer/db/queries';
import {repositories, workflowRuns} from '@gitgazer/db/schema';
import {
    resolveDateBounds,
    type FilterValueResult,
    type FilterValuesParams,
    type GetWorkflowsResponse,
    type PaginationCursor,
    type Schema,
    type WorkflowFilters,
} from '@gitgazer/db/types';
import {and, eq, gte, ilike, inArray, lte, RelationsFilter, sql, SQL} from 'drizzle-orm';

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
            const conditions: RelationsFilter<Schema['workflowRuns'], Schema>[] = [];

            // Keyset pagination: (createdAt, id) < (cursorCreatedAt, cursorId)
            if (cursor?.createdAt && cursor?.id != null) {
                const cursorDate = new Date(cursor.createdAt);
                conditions.push({OR: [{createdAt: {lt: cursorDate}}, {createdAt: {eq: cursorDate}, id: {lt: cursor.id}}]});
            }

            // Column filters
            if (filters?.workflow?.length) {
                conditions.push({name: {in: filters.workflow}});
            }
            if (filters?.repository?.length) {
                // Subquery-based filter — the declarative object DSL's `in`/`notIn` only accept literal
                // value arrays, not subqueries, so this one needs the RAW escape hatch.
                conditions.push({
                    RAW: inArray(
                        workflowRuns.repositoryId,
                        tx.select({id: repositories.id}).from(repositories).where(inArray(repositories.name, filters.repository)),
                    ),
                });
            }
            if (filters?.branch?.length) {
                conditions.push({headBranch: {in: filters.branch}});
            }
            if (filters?.status?.length) {
                const statusValues = filters.status as (typeof workflowRuns.conclusion.enumValues)[number][];
                conditions.push({OR: [{conclusion: {in: statusValues}}, {status: {in: filters.status}}]});
            }
            if (filters?.actor?.length) {
                conditions.push({headCommitAuthorName: {in: filters.actor}});
            }
            if (filters?.commit?.length) {
                conditions.push({headCommitMessage: {in: filters.commit}});
            }
            if (filters?.run_number?.length) {
                const nums = filters.run_number.map(Number).filter((n) => !isNaN(n));
                if (nums.length) {
                    conditions.push({runAttempt: {in: nums}});
                }
            }
            if (filters?.topics?.length) {
                const topicParams = sql.join(
                    filters.topics.map((t) => sql`${t}`),
                    sql`, `,
                );
                // Subquery + raw jsonb `?|` operator — no declarative equivalent, needs RAW.
                conditions.push({
                    RAW: inArray(
                        workflowRuns.repositoryId,
                        tx
                            .select({id: repositories.id})
                            .from(repositories)
                            .where(sql`${repositories.topics} ?| array[${topicParams}]`),
                    ),
                });
            }

            // Date range filter
            const {from, to} = resolveDateBounds(filters);
            if (from || to) {
                conditions.push({createdAt: {gte: from, lte: to}});
            }

            const runs = await tx.query.workflowRuns.findMany({
                with: workflowRunRelations,
                ...(conditions.length ? {where: {AND: conditions}} : {}),
                orderBy: (t, {desc}) => [desc(t.createdAt), desc(t.id)],
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
    const {from, to} = resolveDateBounds(params);
    return [...(from ? [gte(workflowRuns.createdAt, from)] : []), ...(to ? [lte(workflowRuns.createdAt, to)] : [])];
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
            return rows.filter((r): r is FilterValueResult => !!r.value);
        },
    });
};
