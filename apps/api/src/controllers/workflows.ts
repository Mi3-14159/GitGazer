import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {workflowRunRelations} from '@gitgazer/db/queries';
import {workflowRuns} from '@gitgazer/db/schema';
import {GetWorkflowsResponse, PaginationCursor} from '@gitgazer/db/types';
import {and, desc, eq, lt, or, SQL} from 'drizzle-orm';

type WorkflowsParams = {
    integrationIds: string[];
    limit?: number;
    cursor?: PaginationCursor;
};

export const getWorkflows = async ({integrationIds, limit, cursor}: WorkflowsParams): Promise<GetWorkflowsResponse> => {
    if (!integrationIds.length) return {items: [], cursor: undefined};

    const effectiveLimit = Math.min(limit ?? 100, 50);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            // Keyset pagination: (createdAt, id) < (cursorCreatedAt, cursorId)
            let cursorCondition: SQL | undefined;
            if (cursor?.createdAt && cursor?.id != null) {
                const cursorDate = new Date(cursor.createdAt);
                cursorCondition = or(
                    lt(workflowRuns.createdAt, cursorDate),
                    and(eq(workflowRuns.createdAt, cursorDate), lt(workflowRuns.id, cursor.id)),
                );
            }

            const runs = await tx.query.workflowRuns.findMany({
                with: workflowRunRelations,
                ...(cursorCondition ? {where: cursorCondition} : {}),
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
