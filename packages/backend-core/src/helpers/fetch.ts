const DEFAULT_MIN_DELAY_MS = 200;
const DEFAULT_MAX_DELAY_MS = 4000;
const DEFAULT_TIMEOUT_MS = 10_000;
const IDEMPOTENT_METHODS = new Set<Uppercase<string>>(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
}

function parseRetryAfter(header: string | null): number | null {
    if (!header) return null;
    const secs = Number(header);
    if (!Number.isNaN(secs)) return Math.max(0, secs * 1000);

    const dateMs = new Date(header).getTime();
    return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

type RetryPredicate = (err: unknown, res: Response | null) => boolean;

export interface FetchRetryOptions extends RequestInit {
    retries?: number; // number of retry *attempts* after the first try (default 3)
    minDelayMs?: number; // base backoff (default 200)
    maxDelayMs?: number; // max backoff cap (default 4000)
    timeoutMs?: number; // per-attempt timeout (default 10000)
    retryOnMethods?: ReadonlySet<string>; // which methods are eligible (default idempotent)
    retryOn?: RetryPredicate; // custom predicate: (err, res) => boolean
}

export type FetchRetryResponse = Response & {
    attempt: number;
    retries: number;
    error?: unknown;
};

export class FetchRetryError extends Error {
    attempt: number;
    retries: number;
    error: unknown;

    constructor({message, attempt, retries, error}: {message: string; attempt: number; retries: number; error: unknown}) {
        super(message);
        this.attempt = attempt;
        this.retries = retries;
        this.error = error;
    }
}

const defaultRetryOn: RetryPredicate = (err, res) => {
    if (err) return true; // network/DNS/reset/timeout -> retry
    if (!res) return false;
    if (res.status >= 500) return true; // 5xx
    if (res.status === 429) return true; // rate limit
    return false;
};

const calculateDelay = (attempt: number, minDelayMs: number, maxDelayMs: number, retryAfterMs?: number): number => {
    if (retryAfterMs !== undefined) {
        return retryAfterMs;
    }
    const backoffBase = Math.min(maxDelayMs, minDelayMs * 2 ** (attempt - 1));
    const jitter = Math.random() * 0.3 * backoffBase; // up to +30%
    return Math.min(maxDelayMs, backoffBase + jitter);
};

const shouldContinueRetrying = (
    attempt: number,
    error: unknown,
    response: Response | null,
    retries: number,
    isMethodEligible: boolean,
    shouldRetry: RetryPredicate,
): boolean => {
    if (attempt >= retries + 1) return false;
    return isMethodEligible && shouldRetry(error, response);
};

export async function fetchWithRetry(url: string | URL, options: FetchRetryOptions = {}): Promise<FetchRetryResponse> {
    const {
        retries = 3,
        minDelayMs = DEFAULT_MIN_DELAY_MS,
        maxDelayMs = DEFAULT_MAX_DELAY_MS,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        retryOnMethods = IDEMPOTENT_METHODS,
        retryOn,
        ...init
    } = options;

    const method = (init.method ?? 'GET').toUpperCase();
    const shouldRetry = retryOn ?? defaultRetryOn;
    const isMethodEligible = retryOnMethods.has(method);

    let attempt = 0;

    while (true) {
        attempt++;

        // Per-attempt timeout management
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {...init, signal: controller.signal});
            clearTimeout(timeout);

            // Success case - return immediately
            if (response.ok) {
                return Object.assign(response, {
                    attempt,
                    retries,
                });
            }

            // Non-ok response - check if we should retry
            if (!shouldContinueRetrying(attempt, null, response, retries, isMethodEligible, shouldRetry)) {
                // let caller inspect non-ok status
                return Object.assign(response, {
                    attempt,
                    retries,
                });
            }

            // Calculate delay, respecting Retry-After header for 429/503
            const retryAfterHeader = response.headers.get('retry-after');
            const retryAfterMs = parseRetryAfter(retryAfterHeader);
            const delay = calculateDelay(attempt, minDelayMs, maxDelayMs, retryAfterMs ?? undefined);

            await sleep(delay);
        } catch (error) {
            clearTimeout(timeout);

            // Error case - check if we should retry
            if (!shouldContinueRetrying(attempt, error, null, retries, isMethodEligible, shouldRetry)) {
                throw new FetchRetryError({message: 'Fetch failed after retries', attempt, retries, error});
            }

            // Calculate delay for retry
            const delay = calculateDelay(attempt, minDelayMs, maxDelayMs);
            await sleep(delay);
        }
    }
}
