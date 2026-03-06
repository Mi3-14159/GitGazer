import {withRlsTransaction} from '@/clients/rds';
import {GetWorkflowsResponse, PaginationCursor, WorkflowRun} from '@/common/types';
import {workflowRuns} from '@/drizzle/schema';
import {and, desc, eq, lt, or, SQL} from 'drizzle-orm';

type WorkflowsParams = {
    integrationIds: string[];
    limit?: number;
    cursor?: PaginationCursor;
};

export const getWorkflows = async ({integrationIds, limit, cursor}: WorkflowsParams): Promise<GetWorkflowsResponse> => {
    if (!integrationIds.length) return {items: [], cursor: undefined};

    const effectiveLimit = Math.min(limit ?? 100, 50);

    return withRlsTransaction(integrationIds, async (tx) => {
        // Keyset pagination: (createdAt, id) < (cursorCreatedAt, cursorId)
        let cursorCondition: SQL | undefined;
        if (cursor?.createdAt && cursor?.id != null) {
            const cursorDate = new Date(cursor.createdAt);
            cursorCondition = or(lt(workflowRuns.createdAt, cursorDate), and(eq(workflowRuns.createdAt, cursorDate), lt(workflowRuns.id, cursor.id)));
        }

        const runs = await tx.query.workflowRuns.findMany({
            with: {
                workflowJobs: true,
                repository: {
                    with: {
                        owner: true,
                    },
                },
            },
            ...(cursorCondition ? {where: cursorCondition} : {}),
            orderBy: [desc(workflowRuns.createdAt), desc(workflowRuns.id)],
            limit: effectiveLimit,
        });

        const items: WorkflowRun[] = runs.map((run) => ({
            ...run,
            createdAt: run.createdAt.toISOString(),
            runStartedAt: run.runStartedAt.toISOString(),
            updatedAt: run.updatedAt.toISOString(),
            workflowJobs: run.workflowJobs.map((job) => ({
                ...job,
                completedAt: job.completedAt?.toISOString() ?? null,
                createdAt: job.createdAt.toISOString(),
                startedAt: job.startedAt.toISOString(),
            })),
            repository: {
                fullName: `${[run.repository.owner?.login, run.repository.name].filter(Boolean).join('/')}`,
            },
        }));

        const lastItem = runs[runs.length - 1];
        const nextCursor: PaginationCursor | undefined =
            runs.length >= effectiveLimit && lastItem ? {createdAt: lastItem.createdAt.toISOString(), id: lastItem.id} : undefined;

        return {items, cursor: nextCursor};
    });
};
