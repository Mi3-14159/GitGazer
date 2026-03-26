import {enumFilter, stringFilter, useUrlFilters} from '@/composables/useUrlFilters';
import type {EventLogCategory, EventLogType} from '@common/types';
import {EVENT_LOG_CATEGORIES, EVENT_LOG_TYPES} from '@common/types';

export type ReadFilter = 'all' | 'unread' | 'read';
const READ_VALUES = ['all', 'unread', 'read'] as const;

export function useEventLogFilters() {
    const {type, read, category, search} = useUrlFilters({
        type: enumFilter<EventLogType | 'all'>('type', ['all', ...EVENT_LOG_TYPES], 'all'),
        read: enumFilter<ReadFilter>('read', READ_VALUES, 'all'),
        category: enumFilter<EventLogCategory | 'all'>('category', ['all', ...EVENT_LOG_CATEGORIES], 'all'),
        search: stringFilter('search'),
    });

    return {type, read, category, search};
}
