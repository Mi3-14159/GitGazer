import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mockProxyFetch = vi.fn();

vi.mock('@/shared/clients/proxy-fetch', () => ({
    proxyFetch: (...args: any[]) => mockProxyFetch(...args),
}));

import {computeWaitMs, fetchWorkflowRun, GitHubApiError, isRetryable} from './github';

const res = (status: number, headers: Record<string, string> = {}, body = ''): Response => new Response(body || null, {status, headers});

describe('isRetryable', () => {
    it('treats 5xx responses as retryable', () => {
        expect(isRetryable(res(500))).toBe(true);
        expect(isRetryable(res(503))).toBe(true);
    });

    it('treats 429 as retryable', () => {
        expect(isRetryable(res(429))).toBe(true);
    });

    it('treats a 403 with an exhausted rate limit as retryable', () => {
        expect(isRetryable(res(403, {'x-ratelimit-remaining': '0'}))).toBe(true);
    });

    it('treats a 403/429 carrying Retry-After as retryable (secondary/abuse limit)', () => {
        // Secondary limits can fire while the primary quota still has requests left.
        expect(isRetryable(res(403, {'retry-after': '60'}))).toBe(true);
        expect(isRetryable(res(403, {'retry-after': '60', 'x-ratelimit-remaining': '4999'}))).toBe(true);
        expect(isRetryable(res(429, {'retry-after': '60'}))).toBe(true);
    });

    it('treats a plain 403 (not rate-limited) as non-retryable', () => {
        expect(isRetryable(res(403))).toBe(false);
        expect(isRetryable(res(403, {'x-ratelimit-remaining': '5'}))).toBe(false);
    });

    it('treats 4xx client errors as non-retryable', () => {
        expect(isRetryable(res(404))).toBe(false);
        expect(isRetryable(res(422))).toBe(false);
    });
});

describe('computeWaitMs', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('honours retry-after in seconds', () => {
        expect(computeWaitMs(res(429, {'retry-after': '5'}), 1)).toBe(5000);
    });

    it('clamps a negative retry-after to zero', () => {
        expect(computeWaitMs(res(429, {'retry-after': '-3'}), 1)).toBe(0);
    });

    it('waits until x-ratelimit-reset when the remaining quota is exhausted', () => {
        const resetEpoch = Math.floor(Date.now() / 1000) + 30;
        const wait = computeWaitMs(res(403, {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetEpoch)}), 1);

        // ~30s until reset plus the 1s buffer; allow slack for sub-second drift.
        expect(wait).toBeGreaterThan(29_000);
        expect(wait).toBeLessThan(32_000);
    });

    it('falls back to exponential backoff (no jitter when random is 0)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);

        expect(computeWaitMs(res(500), 1)).toBe(500); // 500 * 2^0
        expect(computeWaitMs(res(500), 3)).toBe(2000); // 500 * 2^2
    });

    it('caps the backoff at the maximum', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);

        expect(computeWaitMs(res(500), 10)).toBe(8000); // capped at MAX_BACKOFF_MS
    });

    it('adds jitter on top of the base backoff', () => {
        vi.spyOn(Math, 'random').mockReturnValue(1);

        // base 500 + jitter (1 * 0.3 * 500 = 150)
        expect(computeWaitMs(res(500), 1)).toBeCloseTo(650);
    });
});

describe('fetchJson (exercised via fetchWorkflowRun)', () => {
    beforeEach(() => {
        mockProxyFetch.mockReset();
    });

    it('returns parsed JSON on success', async () => {
        mockProxyFetch.mockResolvedValue(res(200, {}, JSON.stringify({id: 99})));

        const result = await fetchWorkflowRun('acme', 'web', 99, 'pat');

        expect(result).toEqual({id: 99});
        expect(mockProxyFetch).toHaveBeenCalledTimes(1);
    });

    it('sends the bearer token and GitHub API headers', async () => {
        mockProxyFetch.mockResolvedValue(res(200, {}, '{}'));

        await fetchWorkflowRun('acme', 'web', 1, 'secret-token');

        const [, init] = mockProxyFetch.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer secret-token');
        expect(init.headers.Accept).toBe('application/vnd.github+json');
    });

    it('retries a transient 503 then succeeds', async () => {
        mockProxyFetch.mockResolvedValueOnce(res(503, {'retry-after': '0'})).mockResolvedValueOnce(res(200, {}, JSON.stringify({id: 7})));

        const result = await fetchWorkflowRun('acme', 'web', 7, 'pat');

        expect(result).toEqual({id: 7});
        expect(mockProxyFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry a non-retryable 404', async () => {
        mockProxyFetch.mockResolvedValue(res(404, {}, 'not found'));

        await expect(fetchWorkflowRun('acme', 'web', 1, 'pat')).rejects.toMatchObject({status: 404});
        expect(mockProxyFetch).toHaveBeenCalledTimes(1);
    });

    it('fails fast (no inline sleep) when the required wait exceeds the budget', async () => {
        // retry-after far beyond MAX_INLINE_WAIT_MS -> throw with the wait so the worker defers redelivery.
        mockProxyFetch.mockResolvedValue(res(503, {'retry-after': '120'}));

        await expect(fetchWorkflowRun('acme', 'web', 1, 'pat')).rejects.toMatchObject({status: 503, retryAfterMs: 120_000});
        expect(mockProxyFetch).toHaveBeenCalledTimes(1);
    });

    it('surfaces the reset wait (retryAfterMs) on a primary rate-limit 403 without retrying inline', async () => {
        const resetEpoch = Math.floor(Date.now() / 1000) + 1800; // reset ~30 min out
        mockProxyFetch.mockResolvedValue(res(403, {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetEpoch)}, 'rate limited'));

        const error = await fetchWorkflowRun('acme', 'web', 1, 'pat').catch((e) => e as GitHubApiError);

        expect(error).toBeInstanceOf(GitHubApiError);
        expect(error.status).toBe(403);
        expect(error.retryAfterMs).toBeGreaterThan(20_000); // deferred to the reset, not an inline wait
        expect(mockProxyFetch).toHaveBeenCalledTimes(1); // retrying against a locked window is pointless
    });

    it('gives up after the maximum number of attempts', async () => {
        mockProxyFetch.mockResolvedValue(res(503, {'retry-after': '0'}));

        await expect(fetchWorkflowRun('acme', 'web', 1, 'pat')).rejects.toBeInstanceOf(GitHubApiError);
        expect(mockProxyFetch).toHaveBeenCalledTimes(4); // MAX_ATTEMPTS
    });
});
