import {numberArrayFilter, stringArrayFilter, stringFilter, useUrlFilters} from '@/composables/useUrlFilters';
import type {Ref} from 'vue';

// ---------------------------------------------------------------------------
// Event log filter types
// ---------------------------------------------------------------------------

export interface EventLogFilters {
    type: Ref<string[]>;
    read: Ref<string[]>;
    category: Ref<string[]>;
    search: Ref<string>;
    repositoryIds: Ref<number[]>;
    topics: Ref<string[]>;
    integrationIds: Ref<string[]>;
}

/**
 * Creates all event log filter refs (synced to URL query params).
 *
 * Call once in the page-level component.
 */
export function useEventLogFilters(): EventLogFilters {
    return useUrlFilters({
        type: stringArrayFilter('type'),
        read: stringArrayFilter('read', ['unread']),
        category: stringArrayFilter('category'),
        search: stringFilter('search'),
        repositoryIds: numberArrayFilter('repos'),
        topics: stringArrayFilter('topics'),
        integrationIds: stringArrayFilter('integrations'),
    });
}
