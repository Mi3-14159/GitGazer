import config from '@/shared/config';
import {consumeMcpQuota} from '@gitgazer/db/queries';

export class QuotaExceededError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QuotaExceededError';
    }
}

/** Remaining query budget for the current window, surfaced to the MCP client. */
export type QueryBudget = {limit: number; remaining: number; resetAt: string};

/**
 * Count one query against the caller's per-user, fixed-window quota. Throws
 * `QuotaExceededError` once the window is exhausted; otherwise returns the remaining budget.
 * The window is a fixed calendar bucket (floor(now / windowSeconds)), so the count resets
 * automatically when the bucket rolls over.
 */
export const enforceQuota = async (userId: number): Promise<QueryBudget> => {
    const {maxPerWindow, windowSeconds} = config.get('mcpQuota');
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStartSeconds = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
    const windowStart = new Date(windowStartSeconds * 1000);
    const resetAt = new Date((windowStartSeconds + windowSeconds) * 1000).toISOString();

    const count = await consumeMcpQuota(userId, windowStart);
    if (count > maxPerWindow) {
        throw new QuotaExceededError(`Query quota exceeded: ${maxPerWindow} queries per ${windowSeconds}s. Resets at ${resetAt}.`);
    }
    return {limit: maxPerWindow, remaining: Math.max(0, maxPerWindow - count), resetAt};
};
