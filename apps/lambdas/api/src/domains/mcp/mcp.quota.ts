import config from '@gitgazer/backend-core/config';
import {addMcpBudgetCostMs, getMcpBudgetUsedMs} from '@gitgazer/db/queries';

export class QuotaExceededError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QuotaExceededError';
    }
}

/** Budget snapshot returned to the MCP client, in seconds. */
export type QueryBudget = {limit: number; consumed: number; remaining: number; resetAt: string};

/** Resolved budget config carried from reserve to charge. */
export type BudgetReservation = {
    userId: number;
    budgetMs: number;
    windowSeconds: number;
    maxQuerySeconds: number;
};

const resolveConfig = (): {budgetMs: number; windowSeconds: number; maxQuerySeconds: number} => {
    const {budgetSeconds, windowSeconds, maxQuerySeconds} = config.get('mcpQuota');
    if (
        !Number.isInteger(budgetSeconds) ||
        budgetSeconds <= 0 ||
        !Number.isInteger(windowSeconds) ||
        windowSeconds <= 0 ||
        !Number.isInteger(maxQuerySeconds) ||
        maxQuerySeconds <= 0
    ) {
        throw new Error('mcpQuota is misconfigured: budgetSeconds, windowSeconds and maxQuerySeconds must be positive integers');
    }
    return {budgetMs: budgetSeconds * 1000, windowSeconds, maxQuerySeconds};
};

/** Pre-flight the caller's budget for the current rolling window; throws `QuotaExceededError` if it is already exhausted. */
export const reserveQueryBudget = async (userId: number): Promise<BudgetReservation> => {
    const {budgetMs, windowSeconds, maxQuerySeconds} = resolveConfig();
    const {usedMs, windowStart} = await getMcpBudgetUsedMs(userId, windowSeconds);
    if (windowStart && usedMs >= budgetMs) {
        const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000).toISOString();
        throw new QuotaExceededError(`Query budget exceeded: ${budgetMs / 1000} query-seconds per ${windowSeconds}s window. Resets at ${resetAt}.`);
    }
    return {userId, budgetMs, windowSeconds, maxQuerySeconds};
};

/** Charge a query's measured cost (ms) against a reservation and return the budget snapshot (seconds). */
export const chargeQueryBudget = async (reservation: BudgetReservation, costMs: number): Promise<QueryBudget> => {
    const {userId, budgetMs, windowSeconds} = reservation;
    const {consumedMs, windowStart} = await addMcpBudgetCostMs(userId, windowSeconds, Math.max(0, Math.round(costMs)));
    return {
        limit: budgetMs / 1000,
        consumed: consumedMs / 1000,
        remaining: Math.max(0, budgetMs - consumedMs) / 1000,
        resetAt: new Date(windowStart.getTime() + windowSeconds * 1000).toISOString(),
    };
};
