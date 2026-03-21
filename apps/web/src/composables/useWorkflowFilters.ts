import {useTableViews} from '@/composables/useTableViews';
import {dateRangeFilter, useUrlFilters} from '@/composables/useUrlFilters';
import {filterableColumnIds} from '@/types/table';
import type {WorkflowFilters} from '@common/types';
import {watch} from 'vue';
import type {LocationQuery} from 'vue-router';
import {useRoute, useRouter} from 'vue-router';

export function useWorkflowFilters(options: {setFilters: (filters: WorkflowFilters) => void}) {
    const route = useRoute();
    const router = useRouter();

    const {savedViews, currentView, updateColumns, updateFilters, saveView, deleteView, changeView} = useTableViews();

    // Restore column filters from URL query params
    const initialFilters: typeof currentView.value.filters = [];
    for (const columnId of filterableColumnIds) {
        const param = route.query[columnId];
        if (typeof param === 'string' && param.length > 0) {
            initialFilters.push({column: columnId, values: param.split(',')});
        }
    }
    if (initialFilters.length > 0) {
        updateFilters(initialFilters);
    }

    const {dateRange} = useUrlFilters({
        dateRange: dateRangeFilter({window: '24h'}),
    });

    function buildApiFilters(): {apiFilters: WorkflowFilters; query: Record<string, string>} {
        const apiFilters: WorkflowFilters = {};
        const query: Record<string, string> = {};

        for (const f of currentView.value.filters) {
            (apiFilters as Record<string, string[]>)[f.column] = f.values;
            query[f.column] = f.values.join(',');
        }

        if (dateRange.value.window) {
            apiFilters.window = dateRange.value.window as WorkflowFilters['window'];
        } else {
            if (dateRange.value.from) apiFilters.created_from = dateRange.value.from.toISOString();
            if (dateRange.value.to) apiFilters.created_to = dateRange.value.to.toISOString();
        }

        return {apiFilters, query};
    }

    /** Build the initial full URL query from current state. */
    function buildInitialQuery(): LocationQuery {
        const mergedQuery: LocationQuery = {};
        if (dateRange.value.window) {
            mergedQuery.window = dateRange.value.window;
        } else {
            if (dateRange.value.from) mergedQuery.created_from = dateRange.value.from.toISOString();
            if (dateRange.value.to) mergedQuery.created_to = dateRange.value.to.toISOString();
        }
        for (const f of currentView.value.filters) {
            mergedQuery[f.column] = f.values.join(',');
        }
        return mergedQuery;
    }

    function getActiveFilterValues(columnId: string): string[] {
        const filter = currentView.value.filters.find((f) => f.column === columnId);
        return filter?.values ?? [];
    }

    function handleColumnFilterChange(columnId: string, values: string[]) {
        const filters = currentView.value.filters;
        if (values.length === 0) {
            updateFilters(filters.filter((f) => f.column !== columnId));
        } else {
            const otherFilters = filters.filter((f) => f.column !== columnId);
            updateFilters([...otherFilters, {column: columnId, values}]);
        }
    }

    // Sync column filter changes → URL + store
    watch(
        () => currentView.value.filters,
        () => {
            const {apiFilters, query} = buildApiFilters();
            const newQuery = {...route.query};
            for (const col of filterableColumnIds) {
                delete newQuery[col];
            }
            Object.assign(newQuery, query);
            router.replace({query: newQuery});
            options.setFilters(apiFilters);
        },
        {deep: true},
    );

    // Sync date range changes → store
    watch(
        dateRange,
        () => {
            const {apiFilters} = buildApiFilters();
            options.setFilters(apiFilters);
        },
        {deep: true},
    );

    return {
        dateRange,
        savedViews,
        currentView,
        updateColumns,
        saveView,
        deleteView,
        changeView,
        buildApiFilters,
        buildInitialQuery,
        getActiveFilterValues,
        handleColumnFilterChange,
    };
}
