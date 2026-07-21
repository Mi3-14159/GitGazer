import {sql} from 'drizzle-orm';
import {db} from '../client';
import {mcpQueryUsage} from '../schema/gitgazer';

/**
 * Atomically create/increment the caller's query counter for a fixed time window and return
 * the new count. `mcp_query_usage` is a global per-user counter (no tenant RLS), written by
 * the app connection role — mirroring the users-table upsert pattern.
 */
export const consumeMcpQuota = async (userId: number, windowStart: Date, countCap: number): Promise<number> => {
    const rows = await db
        .insert(mcpQueryUsage)
        .values({userId, windowStart, count: 1})
        .onConflictDoUpdate({
            target: [mcpQueryUsage.userId, mcpQueryUsage.windowStart],
            // Cap the counter so a rejected, over-quota caller can't grow it unboundedly (int overflow).
            set: {count: sql`LEAST(${mcpQueryUsage.count} + 1, ${countCap})`},
        })
        .returning({count: mcpQueryUsage.count});
    const count = rows[0]?.count;
    if (count === undefined) {
        // An upsert with RETURNING always yields a row; a missing one means something is wrong.
        // Fail closed rather than reporting 0 used (which would silently bypass the quota).
        throw new Error('Quota upsert returned no row');
    }
    return count;
};
