import {booleanFilter, dateRangeFilter, enumFilter, numberArrayFilter, stringArrayFilter, useUrlFilters} from '@/composables/useUrlFilters';
import type {Granularity, GroupByOption, MetricsFilter} from '@common/types';
import {computed} from 'vue';

// ---------------------------------------------------------------------------
// Dashboard-specific filter composable
// ---------------------------------------------------------------------------

export function useDashboardFilters() {
    const {dateRange, granularity, repositoryIds, topics, defaultBranchOnly, usersOnly, groupBy} = useUrlFilters({
        dateRange: dateRangeFilter(),
        granularity: enumFilter<Granularity>('granularity', ['hour', 'day', 'week', 'month'], 'day'),
        repositoryIds: numberArrayFilter('repos'),
        topics: stringArrayFilter('topics'),
        defaultBranchOnly: booleanFilter('defaultBranch', true),
        usersOnly: booleanFilter('usersOnly', true),
        groupBy: enumFilter<GroupByOption>('groupBy', ['none', 'repository', 'topic'], 'repository'),
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

    return {
        dateRange,
        granularity,
        repositoryIds,
        topics,
        defaultBranchOnly,
        usersOnly,
        groupBy,
        metricsFilter,
    };
}
