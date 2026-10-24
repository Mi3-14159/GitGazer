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

/** Runs tasks as they are submitted, at most `limit` at once; a finished task hands its slot to the next waiter. */
export const createLimiter = (limit: number) => {
    const maxActive = Math.max(limit, 1);
    let active = 0;
    const waiting: Array<() => void> = [];

    const release = () => {
        const next = waiting.shift();
        if (next) next();
        else active--;
    };

    return async <T>(task: () => Promise<T>): Promise<T> => {
        if (active < maxActive) active++;
        else await new Promise<void>((resolve) => waiting.push(resolve));
        try {
            return await task();
        } finally {
            release();
        }
    };
};
