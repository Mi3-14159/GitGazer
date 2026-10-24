import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mapWithConcurrency, TimeoutError, withTimeout} from './async';

describe('withTimeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('rejects with TimeoutError after ms', async () => {
        const result = withTimeout(new Promise<string>(() => {}), 1000);
        const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);

        await vi.advanceTimersByTimeAsync(1000);

        await assertion;
    });

    it('resolves when the promise wins', async () => {
        await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
    });
});

describe('mapWithConcurrency', () => {
    it('never runs more than limit at once', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const resolvers: Array<() => void> = [];

        const run = mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise<void>((resolve) => resolvers.push(resolve));
            inFlight--;
            return n;
        });

        while (resolvers.length < 5) {
            await new Promise((resolve) => setImmediate(resolve));
            resolvers.splice(0).forEach((resolve) => resolve());
            if (inFlight === 0 && maxInFlight >= 2 && resolvers.length === 0) break;
        }
        const results = await run;

        expect(maxInFlight).toBe(2);
        expect(results).toHaveLength(5);
    });

    it('keeps input order and captures rejections', async () => {
        const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
            if (n === 2) throw new Error('boom');
            return n * 10;
        });

        expect(results[0]).toEqual({status: 'fulfilled', value: 10});
        expect(results[1]).toMatchObject({status: 'rejected'});
        expect(results[2]).toEqual({status: 'fulfilled', value: 30});
    });
});
