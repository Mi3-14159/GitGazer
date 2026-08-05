import {modeFilter, numberArrayFilter, stringArrayFilter, stringFilter, useUrlFilters} from '@/composables/useUrlFilters';
import type {FilterMode} from '@common/types';
import type {Ref} from 'vue';

// ---------------------------------------------------------------------------
// Event log filter types
// ---------------------------------------------------------------------------

export interface EventLogFilters {
    type: Ref<string[]>;
    typeMode: Ref<FilterMode>;
    read: Ref<string[]>;
    category: Ref<string[]>;
    categoryMode: Ref<FilterMode>;
    search: Ref<string>;
    repositoryIds: Ref<number[]>;
    repositoryIdsMode: Ref<FilterMode>;
    topics: Ref<string[]>;
    topicsMode: Ref<FilterMode>;
    integrationIds: Ref<string[]>;
    integrationIdsMode: Ref<FilterMode>;
}

/**
 * Creates all event log filter refs (synced to URL query params).
 *
 * Call once in the page-level component.
 */
export function useEventLogFilters(): EventLogFilters {
    return useUrlFilters({
        type: stringArrayFilter('type'),
        typeMode: modeFilter('type_mode'),
        read: stringArrayFilter('read', ['unread']),
        category: stringArrayFilter('category'),
        categoryMode: modeFilter('category_mode'),
        search: stringFilter('search'),
        repositoryIds: numberArrayFilter('repos'),
        repositoryIdsMode: modeFilter('repos_mode'),
        topics: stringArrayFilter('topics'),
        topicsMode: modeFilter('topics_mode'),
        integrationIds: stringArrayFilter('integrations'),
        integrationIdsMode: modeFilter('integrations_mode'),
    });
}
