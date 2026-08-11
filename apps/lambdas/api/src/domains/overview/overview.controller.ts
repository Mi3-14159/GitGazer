import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {workflowRunRelations} from '@gitgazer/db/queries';
import {workflowRuns} from '@gitgazer/db/schema';
import {resolveDateBounds, type OverviewResponse, type WorkflowFilters} from '@gitgazer/db/types';
import {and, count, gte, lte, sql, sum} from 'drizzle-orm';

type OverviewParams = {
    integrationIds: string[];
    filters?: Pick<WorkflowFilters, 'window' | 'created_from' | 'created_to'>;
};

export const getOverview = async ({integrationIds, filters}: OverviewParams): Promise<OverviewResponse> => {
    if (!integrationIds.length) {
        return {stats: {total: 0, success: 0, failure: 0, inProgress: 0, other: 0}, recentWorkflows: []};
    }

    return withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const {from, to} = resolveDateBounds(filters);
            const conditions = [...(from ? [gte(workflowRuns.createdAt, from)] : []), ...(to ? [lte(workflowRuns.createdAt, to)] : [])];
            const whereClause = conditions.length ? and(...conditions) : undefined;

            // Aggregate counts in a single query
            const [statsRow] = await tx
                .select({
                    total: count(),
                    success: sum(sql`CASE WHEN ${workflowRuns.conclusion} = 'success' THEN 1 ELSE 0 END`),
                    failure: sum(sql`CASE WHEN ${workflowRuns.conclusion} = 'failure' THEN 1 ELSE 0 END`),
                    inProgress: sum(sql`CASE WHEN ${workflowRuns.status} = 'in_progress' THEN 1 ELSE 0 END`),
                })
                .from(workflowRuns)
                .where(whereClause);

            const total = statsRow?.total ?? 0;
            const success = Number(statsRow?.success ?? 0);
            const failure = Number(statsRow?.failure ?? 0);
            const inProgress = Number(statsRow?.inProgress ?? 0);
            const other = total - success - failure - inProgress;

            // Recent 4 workflows with full relations
            const recentWorkflows = await tx.query.workflowRuns.findMany({
                with: workflowRunRelations,
                where: {createdAt: {gte: from, lte: to}},
                orderBy: (t, {desc}) => [desc(t.createdAt), desc(t.id)],
                limit: 4,
            });

            return {
                stats: {total, success, failure, inProgress, other},
                recentWorkflows,
            };
        },
    });
};
