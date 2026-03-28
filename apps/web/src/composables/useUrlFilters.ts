import type {DateRange} from '@/components/DateTimeRangePicker.vue';
import {subDays, subHours} from 'date-fns';
import {type Ref, onMounted, ref, watch} from 'vue';
import type {LocationQuery} from 'vue-router';
import {useRoute, useRouter} from 'vue-router';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * Defines how a single filter field maps to/from URL query parameters.
 *
 * Each field owns a slice of the URL query string. It can read from one or
 * many params (e.g. a date range reads `window`, `created_from`, `created_to`)
 * and write back its own params on every change.
 */
export interface FilterDef<T> {
    /** Value used when the URL contains no relevant params. */
    defaultValue: T;
    /** Read URL query params and return the parsed value (or the default). */
    fromUrl: (query: Record<string, string | undefined>) => T;
    /** Serialize the current value into URL query param key/value pairs. */
    toUrl: (value: T) => Record<string, string>;
    /** URL query param keys managed by this filter (cleared before writing). */
    ownedKeys?: string[];
}

/** Maps a schema of FilterDefs → an object of matching Refs. */
export type FilterRefs<S extends Record<string, FilterDef<any>>> = {
    [K in keyof S]: Ref<S[K] extends FilterDef<infer V> ? V : never>;
};

// ---------------------------------------------------------------------------
// Base composable
// ---------------------------------------------------------------------------

/**
 * Creates reactive filter refs that are bidirectionally synced with the URL.
 *
 * 1. On creation, reads initial values from URL query params (falling back to defaults).
 * 2. On mount, writes all values to the URL to ensure a complete, shareable URL.
 * 3. On any ref change, replaces the URL query with the serialised state.
 */
export function useUrlFilters<S extends Record<string, FilterDef<any>>>(schema: S): FilterRefs<S> {
    const route = useRoute();
    const router = useRouter();

    // Snapshot current query params as plain strings
    const query: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(route.query)) {
        if (typeof v === 'string') query[k] = v;
    }

    // Create one ref per schema field, initialized from URL or default
    const refs = {} as Record<string, Ref>;
    for (const [name, def] of Object.entries(schema)) {
        refs[name] = ref(def.fromUrl(query));
    }

    // Merge all serialized fields into the URL, preserving unrelated params
    function syncToUrl() {
        const merged: LocationQuery = {...route.query};
        for (const def of Object.values(schema)) {
            for (const key of def.ownedKeys ?? []) {
                delete merged[key];
            }
        }
        for (const [name, def] of Object.entries(schema)) {
            Object.assign(merged, def.toUrl(refs[name].value));
        }
        router.replace({query: merged});
    }

    onMounted(syncToUrl);
    watch(Object.values(refs), syncToUrl, {deep: true});

    return refs as FilterRefs<S>;
}

// ---------------------------------------------------------------------------
// Factory helpers for common field types
// ---------------------------------------------------------------------------

/** A string-enum filter mapped to a single URL param. Omitted from URL when value equals the default. */
export function enumFilter<T extends string>(urlKey: string, validValues: readonly T[], defaultValue: T): FilterDef<T> {
    return {
        defaultValue,
        fromUrl: (q) => {
            const v = q[urlKey];
            return v && (validValues as readonly string[]).includes(v) ? (v as T) : defaultValue;
        },
        toUrl: (v) => ({[urlKey]: v}),
        ownedKeys: [urlKey],
    };
}

/** A boolean filter serialized as `'1'` / `'0'`. */
export function booleanFilter(urlKey: string, defaultValue: boolean): FilterDef<boolean> {
    return {
        defaultValue,
        fromUrl: (q) => {
            const v = q[urlKey];
            return v !== undefined ? v === '1' : defaultValue;
        },
        toUrl: (v) => ({[urlKey]: v ? '1' : '0'}),
        ownedKeys: [urlKey],
    };
}

/** A comma-separated list of numbers (e.g. repository IDs). Omitted from URL when empty. */
export function numberArrayFilter(urlKey: string): FilterDef<number[]> {
    return {
        defaultValue: [],
        fromUrl: (q) => {
            const v = q[urlKey];
            return v ? v.split(',').map(Number).filter(Number.isFinite) : [];
        },
        toUrl: (v) => (v.length ? {[urlKey]: v.join(',')} : {}),
        ownedKeys: [urlKey],
    };
}

/** A comma-separated list of strings (e.g. topics). Omitted from URL when empty. */
export function stringArrayFilter(urlKey: string): FilterDef<string[]> {
    return {
        defaultValue: [],
        fromUrl: (q) => {
            const v = q[urlKey];
            return v ? v.split(',').filter(Boolean) : [];
        },
        toUrl: (v) => (v.length ? {[urlKey]: v.join(',')} : {}),
        ownedKeys: [urlKey],
    };
}

/** A plain string filter. Omitted from URL when empty or whitespace-only. */
export function stringFilter(urlKey: string, defaultValue = ''): FilterDef<string> {
    return {
        defaultValue,
        fromUrl: (q) => q[urlKey] ?? defaultValue,
        toUrl: (v) => (v.trim() ? {[urlKey]: v.trim()} : {}),
        ownedKeys: [urlKey],
    };
}

// ---------------------------------------------------------------------------
// Date-range filter
// ---------------------------------------------------------------------------

export const WINDOW_RANGES: Record<string, () => {from: Date; to: Date}> = {
    '1h': () => ({from: subHours(new Date(), 1), to: new Date()}),
    '24h': () => ({from: subDays(new Date(), 1), to: new Date()}),
    '7d': () => ({from: subDays(new Date(), 7), to: new Date()}),
    '30d': () => ({from: subDays(new Date(), 30), to: new Date()}),
};

const DEFAULT_WINDOW = '7d';

/** A date-range filter spanning `window`, `created_from`, and `created_to` URL params. */
export function dateRangeFilter(opts?: {from?: Date; to?: Date; window?: string}): FilterDef<DateRange> {
    const defaultWindow = opts?.window ?? DEFAULT_WINDOW;
    const defaultRange =
        opts?.from || opts?.to
            ? {from: opts.from, to: opts.to}
            : defaultWindow in WINDOW_RANGES
              ? WINDOW_RANGES[defaultWindow]()
              : WINDOW_RANGES[DEFAULT_WINDOW]();

    const defaultValue: DateRange = {
        from: defaultRange.from,
        to: defaultRange.to,
        window: opts?.from || opts?.to ? undefined : defaultWindow,
    };

    return {
        defaultValue,
        fromUrl: (q) => {
            if (q.window && q.window in WINDOW_RANGES) {
                const range = WINDOW_RANGES[q.window]();
                return {from: range.from, to: range.to, window: q.window};
            }
            if (q.created_from || q.created_to) {
                return {
                    from: q.created_from ? new Date(q.created_from) : undefined,
                    to: q.created_to ? new Date(q.created_to) : undefined,
                };
            }
            return defaultValue;
        },
        toUrl: (v) => {
            if (v.window) return {window: v.window};
            const result: Record<string, string> = {};
            if (v.from) result.created_from = v.from.toISOString();
            if (v.to) result.created_to = v.to.toISOString();
            return result;
        },
        ownedKeys: ['window', 'created_from', 'created_to'],
    };
}
