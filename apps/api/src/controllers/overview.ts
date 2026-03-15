import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {workflowRunRelations} from '@gitgazer/db/queries';
import {workflowRuns} from '@gitgazer/db/schema';
import type {OverviewResponse, WorkflowFilters} from '@gitgazer/db/types';
import {and, count, desc, gte, lte, SQL, sql, sum} from 'drizzle-orm';

type OverviewParams = {
    integrationIds: string[];
    filters?: Pick<WorkflowFilters, 'window' | 'created_from' | 'created_to'>;
};

function buildDateConditions(filters?: OverviewParams['filters']): SQL[] {
    const conditions: SQL[] = [];

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
        }
        conditions.push(gte(workflowRuns.createdAt, from!));
        conditions.push(lte(workflowRuns.createdAt, now));
    } else {
        if (filters?.created_from) {
            conditions.push(gte(workflowRuns.createdAt, new Date(filters.created_from)));
        }
        if (filters?.created_to) {
            conditions.push(lte(workflowRuns.createdAt, new Date(filters.created_to)));
        }
    }

    return conditions;
}

export const getOverview = async ({integrationIds, filters}: OverviewParams): Promise<OverviewResponse> => {
    if (!integrationIds.length) {
        return {stats: {total: 0, success: 0, failure: 0, inProgress: 0, other: 0}, recentWorkflows: []};
    }

    return withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const conditions = buildDateConditions(filters);
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
                ...(whereClause ? {where: whereClause} : {}),
                orderBy: [desc(workflowRuns.createdAt), desc(workflowRuns.id)],
                limit: 4,
            });

            return {
                stats: {total, success, failure, inProgress, other},
                recentWorkflows,
            };
        },
    });
};
