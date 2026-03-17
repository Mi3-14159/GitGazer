import {type Ref, onMounted, ref, watch} from 'vue';
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
}

/** Maps a schema of FilterDefs → an object of matching Refs. */
type FilterRefs<S extends Record<string, FilterDef<any>>> = {
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

    // Merge all serialized fields into a single query object and push to URL
    function syncToUrl() {
        const merged: Record<string, string> = {};
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

/** A string-enum filter mapped to a single URL param. */
export function enumFilter<T extends string>(urlKey: string, validValues: readonly T[], defaultValue: T): FilterDef<T> {
    return {
        defaultValue,
        fromUrl: (q) => {
            const v = q[urlKey];
            return v && (validValues as readonly string[]).includes(v) ? (v as T) : defaultValue;
        },
        toUrl: (v) => ({[urlKey]: v}),
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
    };
}
