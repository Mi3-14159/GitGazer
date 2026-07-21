import {sql} from 'drizzle-orm';
import {db} from '../client';
import {mcpQueryUsage} from '../schema/gitgazer';

/**
 * Atomically create/increment the caller's query counter for a fixed time window and return
 * the new count. `mcp_query_usage` is a global per-user counter (no tenant RLS), written by
 * the app connection role — mirroring the users-table upsert pattern.
 */
export const consumeMcpQuota = async (userId: number, windowStart: Date): Promise<number> => {
    const rows = await db
        .insert(mcpQueryUsage)
        .values({userId, windowStart, count: 1})
        .onConflictDoUpdate({
            target: [mcpQueryUsage.userId, mcpQueryUsage.windowStart],
            set: {count: sql`${mcpQueryUsage.count} + 1`},
        })
        .returning({count: mcpQueryUsage.count});
    return rows[0]?.count ?? 0;
};
