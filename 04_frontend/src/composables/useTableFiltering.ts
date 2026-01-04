import {computed, ref, watch, type Ref} from 'vue';

export interface FilterableColumn<T = any> {
    name: string;
    value: (item: T) => any;
    filterable?: boolean;
}

export function useTableFiltering<T>(items: Ref<T[]>, columns: Ref<FilterableColumn<T>[]>) {
    const filterableColumns = computed(() => columns.value.filter((column) => column.filterable));

    // Dynamically generate filter state for each filterable column
    const columnFilters = ref<Record<string, Set<string>>>({});

    // Initialize filters when columns change
    watch(
        filterableColumns,
        (newCols) => {
            const newFilters: Record<string, Set<string>> = {};
            newCols.forEach((col) => {
                if (!columnFilters.value[col.name]) {
                    newFilters[col.name] = new Set();
                } else {
                    newFilters[col.name] = columnFilters.value[col.name];
                }
            });
            columnFilters.value = newFilters;
        },
        {immediate: true},
    );

    /*
    - Cache unique values for each filterable column to optimize filter dropdowns.
    - This cache is updated whenever the items or filters change.
    - The logic ensures that if an item is filtered out by one column, its values are not
    counted in the unique values of other columns, except for the column that filtered it out.
    This provides a more intuitive filtering experience.
     */
    const uniqueValuesCache = computed(() => {
        const cache = new Map<string, Set<any>>();
        filterableColumns.value.forEach((column) => cache.set(column.name, new Set()));

        for (const item of items.value) {
            const itemValues = new Map<string, any>();
            const failingColumns: string[] = [];

            for (const column of filterableColumns.value) {
                const val = column.value(item);
                itemValues.set(column.name, val);

                const filterSet = columnFilters.value[column.name];
                if (filterSet && filterSet.size > 0 && !filterSet.has(val)) {
                    failingColumns.push(column.name);
                }
            }

            if (failingColumns.length === 0) {
                // Item passes all filters, add its values to all columns
                filterableColumns.value.forEach((column) => {
                    const val = itemValues.get(column.name);
                    if (val !== undefined && val !== null && val !== '') {
                        cache.get(column.name)?.add(val);
                    }
                });
            } else if (failingColumns.length === 1) {
                // Item fails exactly one filter.
                // Add its value to that failing column's cache (so it appears in the dropdown)
                // but NOT to other columns (since it's filtered out by this one).
                const colName = failingColumns[0];
                const val = itemValues.get(colName);
                if (val !== undefined && val !== null && val !== '') {
                    cache.get(colName)?.add(val);
                }
            }
        }
        return cache;
    });

    // Keep selected filters valid when data changes
    watch(uniqueValuesCache, (newCache, oldCache) => {
        if (!oldCache) return;

        for (const [columnName, newValues] of newCache.entries()) {
            const oldValues = oldCache.get(columnName);
            const filterSet = columnFilters.value[columnName];

            // hide any new filter values which do not correspond to existing data
            // when at least one filter is already applied
            if (filterSet && filterSet.size > 0 && oldValues) {
                for (const val of newValues) {
                    if (!oldValues.has(val)) {
                        filterSet.add(val);
                    }
                }
            }
        }
    });

    const filteredItems = computed(() => {
        return items.value.filter((item) => {
            return filterableColumns.value.every((column) => {
                const filterSet = columnFilters.value[column.name];
                if (!filterSet || filterSet.size === 0) return true;

                const value = column.value(item);
                // If the set has the value, it is EXCLUDED.
                return !filterSet.has(value);
            });
        });
    });

    const toggleFilter = (column: string, value: string) => {
        const filterSet = columnFilters.value[column];
        if (!filterSet) return;

        if (filterSet.has(value)) {
            filterSet.delete(value);
        } else {
            filterSet.add(value);
        }
    };

    const clearColumnFilter = (column: string) => {
        const filterSet = columnFilters.value[column];
        if (filterSet) {
            filterSet.clear();
        }
    };

    const selectOnlyFilter = (column: string, value: string) => {
        const filterSet = columnFilters.value[column];
        if (!filterSet) return;

        const allValues = uniqueValuesCache.value.get(column);
        if (!allValues) return;

        // Clear and add all values except the selected one (so only the selected one is visible)
        filterSet.clear();
        allValues.forEach((v) => {
            if (v !== value) {
                filterSet.add(v);
            }
        });
    };

    return {
        columnFilters,
        uniqueValuesCache,
        filteredItems,
        toggleFilter,
        clearColumnFilter,
        selectOnlyFilter,
    };
}
