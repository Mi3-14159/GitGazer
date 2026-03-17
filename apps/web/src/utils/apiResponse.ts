/**
 * Validates and parses a JSON API response against an optional type guard.
 *
 * - Ensures the response body is valid JSON (catches HTML error pages, empty bodies).
 * - When a guard is provided, validates the parsed value at runtime.
 * - Throws descriptive errors so callers can distinguish parse failures from network issues.
 */
export async function parseApiResponse<T>(response: Response, guard?: (value: unknown) => value is T): Promise<T> {
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new Error(`Invalid JSON from ${response.url} (status ${response.status})`);
    }

    if (guard && !guard(body)) {
        throw new Error(`Unexpected response shape from ${response.url}`);
    }

    return body as T;
}

/** Type guard: value is a non-null object. */
export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type guard: value is an array where every element passes the item guard. */
export function isArrayOf<T>(guard: (v: unknown) => v is T): (value: unknown) => value is T[] {
    return (value: unknown): value is T[] => Array.isArray(value) && value.every(guard);
}
