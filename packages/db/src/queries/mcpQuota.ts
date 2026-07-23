import {and, desc, eq, gt, sql} from 'drizzle-orm';
import {db} from '../client';
import {mcpQueryUsage} from '../schema/gitgazer';

/** Consumed budget (ms) + window start for the caller's latest active window, or {0, null} if none is active. */
export const getMcpBudgetUsedMs = async (userId: number, windowSeconds: number): Promise<{usedMs: number; windowStart: Date | null}> => {
    const rows = await db
        .select({consumedMs: mcpQueryUsage.consumedMs, windowStart: mcpQueryUsage.windowStart})
        .from(mcpQueryUsage)
        .where(and(eq(mcpQueryUsage.userId, userId), gt(mcpQueryUsage.windowStart, sql`now() - make_interval(secs => ${windowSeconds})`)))
        .orderBy(desc(mcpQueryUsage.windowStart))
        .limit(1);
    const row = rows[0];
    return {usedMs: row?.consumedMs ?? 0, windowStart: row?.windowStart ?? null};
};

/**
 * Add a query's cost (ms) to the caller's active window and return the new total + window start.
 * Each window is kept as history: while the window is still active its row is incremented; once it
 * has expired a NEW row (a new window) is inserted instead of overwriting the old one.
 */
export const addMcpBudgetCostMs = async (userId: number, windowSeconds: number, costMs: number): Promise<{consumedMs: number; windowStart: Date}> => {
    const updated = await db
        .update(mcpQueryUsage)
        .set({consumedMs: sql`${mcpQueryUsage.consumedMs} + ${costMs}`})
        .where(and(eq(mcpQueryUsage.userId, userId), gt(mcpQueryUsage.windowStart, sql`now() - make_interval(secs => ${windowSeconds})`)))
        .returning({consumedMs: mcpQueryUsage.consumedMs, windowStart: mcpQueryUsage.windowStart});
    if (updated[0]) {
        return updated[0];
    }

    const inserted = await db
        .insert(mcpQueryUsage)
        .values({userId, windowStart: sql`now()`, consumedMs: costMs})
        .returning({consumedMs: mcpQueryUsage.consumedMs, windowStart: mcpQueryUsage.windowStart});
    const row = inserted[0];
    if (row === undefined) {
        // INSERT ... RETURNING always yields a row; a missing one means something is wrong.
        throw new Error('Budget insert returned no row');
    }
    return row;
};
