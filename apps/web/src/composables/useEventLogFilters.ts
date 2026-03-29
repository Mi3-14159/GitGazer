import {enumFilter, numberArrayFilter, stringArrayFilter, stringFilter, useUrlFilters} from '@/composables/useUrlFilters';
import type {EventLogCategory, EventLogReadFilter, EventLogType} from '@common/types';
import {EVENT_LOG_CATEGORIES, EVENT_LOG_READ_VALUES, EVENT_LOG_TYPES} from '@common/types';
import type {Ref} from 'vue';

// ---------------------------------------------------------------------------
// Event log filter types
// ---------------------------------------------------------------------------

export interface EventLogFilters {
    type: Ref<EventLogType | 'all'>;
    read: Ref<EventLogReadFilter>;
    category: Ref<EventLogCategory | 'all'>;
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
        type: enumFilter<EventLogType | 'all'>('type', ['all', ...EVENT_LOG_TYPES], 'all'),
        read: enumFilter<EventLogReadFilter>('read', EVENT_LOG_READ_VALUES, 'unread'),
        category: enumFilter<EventLogCategory | 'all'>('category', ['all', ...EVENT_LOG_CATEGORIES], 'all'),
        search: stringFilter('search'),
        repositoryIds: numberArrayFilter('repos'),
        topics: stringArrayFilter('topics'),
        integrationIds: stringArrayFilter('integrations'),
    });
}
