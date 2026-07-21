import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/queries', () => ({consumeMcpQuota: vi.fn()}));
vi.mock('@/shared/config', () => ({default: {get: vi.fn(() => ({maxPerWindow: 3, windowSeconds: 3600}))}}));

let db: typeof import('@gitgazer/db/queries');
let mod: typeof import('@/domains/mcp/mcp.quota');

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

describe('enforceQuota', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        db = await import('@gitgazer/db/queries');
        mod = await import('@/domains/mcp/mcp.quota');
    });

    afterEach(() => vi.useRealTimers());

    const setCount = (n: number): void => {
        asMock(db.consumeMcpQuota).mockResolvedValue(n);
    };

    it('consumes one query and returns the remaining budget under the limit', async () => {
        setCount(1);
        await expect(mod.enforceQuota(7)).resolves.toMatchObject({limit: 3, remaining: 2, resetAt: expect.any(String)});
    });

    it('allows exactly maxPerWindow queries (remaining 0)', async () => {
        setCount(3);
        await expect(mod.enforceQuota(7)).resolves.toMatchObject({remaining: 0});
    });

    it('throws once the window is exhausted', async () => {
        setCount(4);
        await expect(mod.enforceQuota(7)).rejects.toThrow(mod.QuotaExceededError);
    });

    it('buckets by a fixed window and passes the window start to the DB', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-21T00:30:00.000Z'));
        setCount(1);

        await mod.enforceQuota(7);

        const [userId, windowStart] = asMock(db.consumeMcpQuota).mock.calls[0];
        expect(userId).toBe(7);
        // windowSeconds 3600 → the bucket start is the top of the hour.
        expect((windowStart as Date).toISOString()).toBe('2026-07-21T00:00:00.000Z');
    });
});
