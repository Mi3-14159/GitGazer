import {booleanFilter, dateRangeFilter, enumFilter, numberArrayFilter, useUrlFilters} from '@/composables/useUrlFilters';
import type {Granularity, GroupByOption, MetricsFilter} from '@common/types';
import {computed} from 'vue';

// ---------------------------------------------------------------------------
// Dashboard-specific filter composable
// ---------------------------------------------------------------------------

export function useMetricsFilters() {
    const {dateRange, granularity, repositoryIds, defaultBranchOnly, usersOnly, groupBy} = useUrlFilters({
        dateRange: dateRangeFilter(),
        granularity: enumFilter<Granularity>('granularity', ['hour', 'day', 'week', 'month'], 'day'),
        repositoryIds: numberArrayFilter('repos'),
        defaultBranchOnly: booleanFilter('defaultBranch', true),
        usersOnly: booleanFilter('usersOnly', true),
        groupBy: enumFilter<GroupByOption>('groupBy', ['none', 'repository'], 'repository'),
    });

    const metricsFilter = computed<MetricsFilter>(() => {
        const filter: MetricsFilter = {};
        if (dateRange.value.from) filter.from = dateRange.value.from.toISOString();
        if (dateRange.value.to) filter.to = dateRange.value.to.toISOString();
        filter.granularity = granularity.value;
        if (repositoryIds.value.length) filter.repositoryIds = repositoryIds.value;
        if (defaultBranchOnly.value) filter.defaultBranchOnly = true;
        if (usersOnly.value) filter.usersOnly = true;
        if (groupBy.value !== 'none') filter.groupBy = groupBy.value;
        return filter;
    });

    return {
        dateRange,
        granularity,
        repositoryIds,
        defaultBranchOnly,
        usersOnly,
        groupBy,
        metricsFilter,
    };
}
