import type {DateRange} from '@/components/DateTimeRangePicker.vue';
import {booleanFilter, enumFilter, type FilterDef, numberArrayFilter, useUrlFilters} from '@/composables/useUrlFilters';
import type {Granularity, GroupByOption, MetricsFilter} from '@common/types';
import {subDays, subHours} from 'date-fns';
import {computed} from 'vue';

// ---------------------------------------------------------------------------
// Date-range window presets
// ---------------------------------------------------------------------------

const WINDOW_RANGES: Record<string, () => {from: Date; to: Date}> = {
    '1h': () => ({from: subHours(new Date(), 1), to: new Date()}),
    '24h': () => ({from: subDays(new Date(), 1), to: new Date()}),
    '7d': () => ({from: subDays(new Date(), 7), to: new Date()}),
    '30d': () => ({from: subDays(new Date(), 30), to: new Date()}),
};

const DEFAULT_WINDOW = '7d';

/** Custom FilterDef for the date range which spans multiple URL params. */
function dateRangeFilter(): FilterDef<DateRange> {
    const defaultRange = WINDOW_RANGES[DEFAULT_WINDOW]();
    return {
        defaultValue: {from: defaultRange.from, to: defaultRange.to, window: DEFAULT_WINDOW},
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
            const range = WINDOW_RANGES[DEFAULT_WINDOW]();
            return {from: range.from, to: range.to, window: DEFAULT_WINDOW};
        },
        toUrl: (v) => {
            if (v.window) return {window: v.window};
            const result: Record<string, string> = {};
            if (v.from) result.created_from = v.from.toISOString();
            if (v.to) result.created_to = v.to.toISOString();
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// Dashboard-specific filter composable
// ---------------------------------------------------------------------------

export function useDashboardFilters() {
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
