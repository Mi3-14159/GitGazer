import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createLimiter, TimeoutError, withTimeout} from './async';

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

describe('createLimiter', () => {
    const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => (resolve = r));
        return {promise, resolve};
    };

    it('never runs more than limit at once, even when new tasks arrive while others finish', async () => {
        const limit = createLimiter(2);
        let inFlight = 0;
        let maxInFlight = 0;
        const gates = Array.from({length: 5}, deferred);
        const run = (i: number) =>
            limit(async () => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await gates[i].promise;
                inFlight--;
                return i;
            });

        const first = [run(0), run(1), run(2)];
        gates[0].resolve();
        const late = run(3);
        gates.forEach((gate) => gate.resolve());

        expect(await Promise.all([...first, late, run(4)])).toEqual([0, 1, 2, 3, 4]);
        expect(maxInFlight).toBe(2);
    });

    it('starts a task immediately when a slot is free', async () => {
        const limit = createLimiter(1);
        const started: number[] = [];

        const a = limit(async () => {
            started.push(1);
        });

        expect(started).toEqual([1]);
        await a;
    });

    it('passes rejections through and frees the slot', async () => {
        const limit = createLimiter(1);

        await expect(limit(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
        await expect(limit(async () => 'ok')).resolves.toBe('ok');
    });
});
