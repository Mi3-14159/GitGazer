export class TimeoutError extends Error {
    constructor(ms: number) {
        super(`Timed out after ${ms}ms`);
        this.name = 'TimeoutError';
    }
}

export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });

export const mapWithConcurrency = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> => {
    const results = new Array<PromiseSettledResult<R>>(items.length);
    let next = 0;

    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            try {
                results[index] = {status: 'fulfilled', value: await fn(items[index])};
            } catch (reason) {
                results[index] = {status: 'rejected', reason};
            }
        }
    };

    await Promise.all(Array.from({length: Math.min(Math.max(limit, 1), items.length)}, worker));
    return results;
};
