import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {workflowRunRelations} from '@gitgazer/db/queries';
import {repositories, workflowRuns} from '@gitgazer/db/schema';
import {GetWorkflowsResponse, PaginationCursor, WorkflowFilters} from '@gitgazer/db/types';
import {and, desc, eq, inArray, lt, or, SQL} from 'drizzle-orm';

type WorkflowsParams = {
    integrationIds: string[];
    limit?: number;
    cursor?: PaginationCursor;
    filters?: WorkflowFilters;
};

export const getWorkflows = async ({integrationIds, limit, cursor, filters}: WorkflowsParams): Promise<GetWorkflowsResponse> => {
    if (!integrationIds.length) return {items: [], cursor: undefined};

    const effectiveLimit = Math.min(limit ?? 100, 50);

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
