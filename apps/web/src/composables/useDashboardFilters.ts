import type {DateRange} from '@/components/DateTimeRangePicker.vue';
import {booleanFilter, dateRangeFilter, enumFilter, numberArrayFilter, stringArrayFilter, useUrlFilters} from '@/composables/useUrlFilters';
import {GRANULARITY_VALUES, GROUP_BY_OPTIONS, type Granularity, type GroupByOption, type MetricsFilter} from '@common/types';
import {type Ref, computed} from 'vue';

// ---------------------------------------------------------------------------
// Dashboard filter types
// ---------------------------------------------------------------------------

export interface DashboardFilters {
    dateRange: Ref<DateRange>;
    granularity: Ref<Granularity>;
    repositoryIds: Ref<number[]>;
    topics: Ref<string[]>;
    defaultBranchOnly: Ref<boolean>;
    usersOnly: Ref<boolean>;
    groupBy: Ref<GroupByOption>;
    metricsFilter: Ref<MetricsFilter>;
}

/**
 * Creates all dashboard filter refs (synced to URL query params) and derives
 * the `metricsFilter` computed.
 *
 * Call once in the page-level component.
 */
export function useDashboardFilters(): DashboardFilters {
    const {dateRange, granularity, repositoryIds, topics, defaultBranchOnly, usersOnly, groupBy} = useUrlFilters({
        dateRange: dateRangeFilter(),
        granularity: enumFilter<Granularity>('granularity', GRANULARITY_VALUES, 'day'),
        repositoryIds: numberArrayFilter('repos'),
        topics: stringArrayFilter('topics'),
        defaultBranchOnly: booleanFilter('defaultBranch', true),
        usersOnly: booleanFilter('usersOnly', true),
        groupBy: enumFilter<GroupByOption>('groupBy', GROUP_BY_OPTIONS, 'repository'),
    });

    const metricsFilter = computed<MetricsFilter>(() => {
        const filter: MetricsFilter = {};
        if (dateRange.value.from) filter.from = dateRange.value.from.toISOString();
        if (dateRange.value.to) filter.to = dateRange.value.to.toISOString();
        filter.granularity = granularity.value;
        if (repositoryIds.value.length) filter.repositoryIds = repositoryIds.value;
        if (topics.value.length) filter.topics = topics.value;
        if (defaultBranchOnly.value) filter.defaultBranchOnly = true;
        if (usersOnly.value) filter.usersOnly = true;
        if (groupBy.value !== 'none') filter.groupBy = groupBy.value;
        return filter;
    });

    return {dateRange, granularity, repositoryIds, topics, defaultBranchOnly, usersOnly, groupBy, metricsFilter};
}
