import type {FilterDef, FilterRefs} from '@/composables/useUrlFilters';
import {inject, type InjectionKey, type Ref} from 'vue';

export type {FilterRefs} from '@/composables/useUrlFilters';

/** Injection key used by FilterRoot to provide filter refs to descendants. */
export const FILTER_INJECTION_KEY: InjectionKey<Record<string, Ref>> = Symbol('filter-root');

/**
 * Inject filter refs provided by a parent `<FilterRoot>` component.
 * Pass the schema object for automatic type inference (the value is not used at runtime).
 *
 * Recommended access patterns (in order of preference):
 *   1. Scoped slot  — `v-slot="{ values }"` on `<FilterRoot>`
 *   2. `useFilterValues(schema)` — for deeply nested descendants
 *   3. Template ref — escape-hatch only (loses generic type narrowing)
 */
export function useFilterValues<S extends Record<string, FilterDef<any>>>(_schema?: S): FilterRefs<S> {
    const filters = inject(FILTER_INJECTION_KEY);
    if (!filters) {
        throw new Error('useFilterValues() must be used inside a <FilterRoot> component');
    }
    return filters as FilterRefs<S>;
}
