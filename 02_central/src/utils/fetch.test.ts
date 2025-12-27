import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FetchRetryError, fetchWithRetry} from './fetch';

type FetchStep = {type: 'resolve'; value: Response} | {type: 'reject'; value: unknown};

function mockFetchSequence(steps: FetchStep[]) {
    const fn = vi.fn(async () => {
        const step = steps.shift();
        if (!step) throw new Error('mockFetchSequence: no more steps');
        if (step.type === 'reject') throw step.value;
        return step.value;
    });

    return fn;
}

function abortableFetchMock(onAbort?: () => void) {
    return vi.fn((_: unknown, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            if (!signal) return; // would hang; but our code always passes a signal

            const handler = () => {
                onAbort?.();
                const err = Object.assign(new Error('Aborted'), {name: 'AbortError'});
                reject(err);
            };

            if (signal.aborted) handler();
            else signal.addEventListener('abort', handler, {once: true});
        });
    });
}

function timeoutDelaysFrom(spy: ReturnType<typeof vi.spyOn>) {
    return spy.mock.calls.map((args: any[]) => args[1]).filter((ms: any): ms is number => typeof ms === 'number');
}

describe('fetchWithRetry', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns immediately on ok response and annotates attempt/retries', async () => {
        const res = new Response('ok', {status: 200});
        const fetchMock = mockFetchSequence([{type: 'resolve', value: res}]);
        vi.stubGlobal('fetch', fetchMock);

        const out = await fetchWithRetry('https://example.com');

        expect(out.ok).toBe(true);
        expect((out as any).attempt).toBe(1);
        expect((out as any).retries).toBe(3);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns non-ok response without throwing when not retryable (e.g. 400)', async () => {
        const res = new Response('bad', {status: 400});
        const fetchMock = mockFetchSequence([{type: 'resolve', value: res}]);
        vi.stubGlobal('fetch', fetchMock);

        const out = await fetchWithRetry('https://example.com');

        expect(out.ok).toBe(false);
        expect(out.status).toBe(400);
        expect((out as any).attempt).toBe(1);
        expect((out as any).retries).toBe(3);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries on network error for idempotent methods (GET) and then succeeds', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0); // deterministic jitter

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        const fetchMock = mockFetchSequence([
            {type: 'reject', value: new Error('ECONNRESET')},
            {type: 'resolve', value: new Response('ok', {status: 200})},
        ]);
        vi.stubGlobal('fetch', fetchMock);

        const p = fetchWithRetry('https://example.com', {
            retries: 3,
            minDelayMs: 200,
            maxDelayMs: 4000,
            timeoutMs: 60_000, // avoid confusing abort timeout with backoff in assertions
        });

        // First attempt fails immediately -> schedules sleep(200) before retry
        await vi.advanceTimersByTimeAsync(200);

        const out = await p;

        expect(out.ok).toBe(true);
        expect((out as any).attempt).toBe(2);
        expect((out as any).retries).toBe(3);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const delays = timeoutDelaysFrom(setTimeoutSpy);
        expect(delays).toContain(200);
    });

    it('does not retry by default for non-idempotent method (POST) on network error', async () => {
        const fetchMock = mockFetchSequence([{type: 'reject', value: new Error('network down')}]);
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            fetchWithRetry('https://example.com', {
                method: 'POST',
                retries: 5,
            }),
        ).rejects.toBeInstanceOf(FetchRetryError);

        try {
            await fetchWithRetry('https://example.com', {method: 'POST', retries: 5});
        } catch (e) {
            const err = e as FetchRetryError;
            expect(err.attempt).toBe(1);
            expect(err.retries).toBe(5);
            expect(fetchMock).toHaveBeenCalledTimes(2); // called once per invocation above
        }
    });

    it('retries on 5xx response and returns when a later attempt is ok', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        const fetchMock = mockFetchSequence([
            {type: 'resolve', value: new Response('nope', {status: 500})},
            {type: 'resolve', value: new Response('ok', {status: 200})},
        ]);
        vi.stubGlobal('fetch', fetchMock);

        const p = fetchWithRetry('https://example.com', {
            retries: 2,
            minDelayMs: 200,
            maxDelayMs: 4000,
            timeoutMs: 60_000,
        });

        // after first 500, it should sleep(200) before retrying
        await vi.advanceTimersByTimeAsync(200);

        const out = await p;

        expect(out.ok).toBe(true);
        expect((out as any).attempt).toBe(2);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const delays = timeoutDelaysFrom(setTimeoutSpy);
        expect(delays).toContain(200);
    });

    it('retries on 429 and respects Retry-After (seconds)', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);

        const fetchMock = mockFetchSequence([
            {
                type: 'resolve',
                value: new Response('rate limited', {
                    status: 429,
                    headers: {'retry-after': '2'},
                }),
            },
            {type: 'resolve', value: new Response('ok', {status: 200})},
        ]);
        vi.stubGlobal('fetch', fetchMock);

        const p = fetchWithRetry('https://example.com', {
            retries: 3,
            minDelayMs: 200,
            maxDelayMs: 4000,
            timeoutMs: 60_000,
        });

        // First fetch happens immediately
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Before 2s, no retry yet
        await vi.advanceTimersByTimeAsync(1999);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // At 2s, retry should happen and succeed
        await vi.advanceTimersByTimeAsync(1);

        const out = await p;
        expect(out.ok).toBe(true);
        expect((out as any).attempt).toBe(2);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('aborts per-attempt on timeout, retries, and throws FetchRetryError after retries exhausted', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);

        let abortCount = 0;
        const fetchMock = abortableFetchMock(() => {
            abortCount += 1;
        });
        vi.stubGlobal('fetch', fetchMock);

        const timeoutMs = 50;
        const minDelayMs = 20;

        const p = fetchWithRetry('https://example.com', {
            retries: 1, // total attempts = 2
            timeoutMs,
            minDelayMs,
            maxDelayMs: 4000,
        });

        // Attach a handler immediately to avoid unhandled rejection warnings.
        const errorPromise: Promise<FetchRetryError> = p.then(
            () => {
                throw new Error('Expected fetchWithRetry to reject');
            },
            (e) => e as FetchRetryError,
        );

        // Attempt 1: abort at 50ms, then sleep(20ms)
        await vi.advanceTimersByTimeAsync(timeoutMs);
        await vi.advanceTimersByTimeAsync(minDelayMs);

        // Attempt 2: abort at 50ms, then should stop (no more retries)
        await vi.advanceTimersByTimeAsync(timeoutMs);

        const err = await errorPromise;
        expect(err).toBeInstanceOf(FetchRetryError);
        expect(err.attempt).toBe(2);
        expect(err.retries).toBe(1);
        expect(abortCount).toBe(2);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
