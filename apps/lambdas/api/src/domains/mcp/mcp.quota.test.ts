import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/queries', () => ({getMcpBudgetUsedMs: vi.fn(), addMcpBudgetCostMs: vi.fn()}));
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => ({budgetSeconds: 600, windowSeconds: 3600, maxQuerySeconds: 60}))}}));

let db: typeof import('@gitgazer/db/queries');
let mod: typeof import('@/domains/mcp/mcp.quota');

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

describe('query budget', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        db = await import('@gitgazer/db/queries');
        mod = await import('@/domains/mcp/mcp.quota');
    });

    afterEach(() => vi.useRealTimers());

    const WINDOW_START = new Date('2026-07-21T00:00:00.000Z');
    const setUsed = (usedMs: number, windowStart: Date | null = WINDOW_START): void => {
        asMock(db.getMcpBudgetUsedMs).mockResolvedValue({usedMs, windowStart});
    };
    const setCharged = (consumedMs: number, windowStart: Date = WINDOW_START): void => {
        asMock(db.addMcpBudgetCostMs).mockResolvedValue({consumedMs, windowStart});
    };

    describe('reserveQueryBudget', () => {
        it('returns a reservation with the resolved budget when under the limit', async () => {
            setUsed(0, null);
            const rsv = await mod.reserveQueryBudget(7);
            expect(rsv).toEqual({userId: 7, budgetMs: 600_000, windowSeconds: 3600, maxQuerySeconds: 60});
        });

        it('passes the window duration to the DB', async () => {
            setUsed(0, null);
            await mod.reserveQueryBudget(7);
            expect(asMock(db.getMcpBudgetUsedMs).mock.calls[0]).toEqual([7, 3600]);
        });

        it('allows a query while any budget remains', async () => {
            setUsed(599_999);
            await expect(mod.reserveQueryBudget(7)).resolves.toMatchObject({budgetMs: 600_000});
        });

        it('throws once the window budget is exhausted, with resetAt from the stored window start', async () => {
            setUsed(600_000, new Date('2026-07-21T00:00:00.000Z'));
            await expect(mod.reserveQueryBudget(7)).rejects.toThrow(mod.QuotaExceededError);
            await expect(mod.reserveQueryBudget(7)).rejects.toThrow('Resets at 2026-07-21T01:00:00.000Z');
        });
    });

    describe('chargeQueryBudget', () => {
        const reservation = {
            userId: 7,
            budgetMs: 600_000,
            windowSeconds: 3600,
            maxQuerySeconds: 60,
        };

        it('adds the rounded cost and returns the snapshot in seconds', async () => {
            setCharged(12_345, new Date('2026-07-21T00:00:00.000Z'));
            const budget = await mod.chargeQueryBudget(reservation, 1234.6);

            expect(asMock(db.addMcpBudgetCostMs).mock.calls[0]).toEqual([7, 3600, 1235]);
            expect(budget.limit).toBe(600);
            expect(budget.consumed).toBeCloseTo(12.345, 3);
            expect(budget.remaining).toBeCloseTo(587.655, 3);
            // resetAt = window start + windowSeconds.
            expect(budget.resetAt).toBe('2026-07-21T01:00:00.000Z');
        });

        it('clamps remaining to 0 when the charge pushes over budget', async () => {
            setCharged(660_000);
            await expect(mod.chargeQueryBudget(reservation, 60_000)).resolves.toMatchObject({consumed: 660, remaining: 0});
        });

        it('floors a negative measured cost to 0 before charging', async () => {
            setCharged(0);
            await mod.chargeQueryBudget(reservation, -5);
            expect(asMock(db.addMcpBudgetCostMs).mock.calls[0][2]).toBe(0);
        });
    });
});
