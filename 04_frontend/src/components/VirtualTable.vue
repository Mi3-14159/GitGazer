<script setup lang="ts" generic="T">
    import ColumnHeader from '@/components/ColumnHeader.vue';
    import {WorkflowGroup} from '@/stores/jobs';
    import {Job, WorkflowJobEvent} from '@common/types';
    import {computed, ref} from 'vue';

    export interface HeaderColumn<T = any> {
        name: string;
        scope: 'group' | 'row' | 'both';
        width?: string;
        value: (item: T) => any;
        filterable?: boolean;
    }

    const props = withDefaults(
        defineProps<{
            items: WorkflowGroup[];
            height?: string | number;
            threshold?: number;
            loading?: boolean;
            headerConfig?: HeaderColumn[];
            onJobClick?: (job: Job<WorkflowJobEvent>) => void;
            loadMore?: () => void;
        }>(),
        {
            height: '100%',
            threshold: 200,
            loading: false,
            headerConfig: () => [],
        },
    );

    const columns = computed(() => {
        const firstCol: HeaderColumn = {
            name: '',
            scope: 'both',
            width: '0.1fr',
            value: () => '',
            filterable: false,
        };
        return [firstCol, ...props.headerConfig];
    });

    const gridStyle = computed(() => {
        return {
            display: 'grid',
            gridTemplateColumns: columns.value.map((c) => c.width || '1fr').join(' '),
            gap: '8px',
            padding: '0 16px',
            alignItems: 'center',
        };
    });

    const onScroll = (e: Event) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        // Check if we are near the bottom
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - props.threshold && !props.loading) {
            props.loadMore?.();
        }
    };

    /* Group Expand/Collapse Logic */
    const expandedGroups = ref<Set<string>>(new Set());
    const collapsedGroups = ref<Set<string>>(new Set());
    const useCollapsedInsteadOfExpanded = false;

    const toggleGroup = (id: string) => {
        if (expandedGroups.value.has(id)) {
            expandedGroups.value.delete(id);
        } else {
            expandedGroups.value.add(id);
        }

        if (collapsedGroups.value.has(id)) {
            collapsedGroups.value.delete(id);
        } else {
            collapsedGroups.value.add(id);
        }
    };

    const isExpanded = (id: string) => {
        if (useCollapsedInsteadOfExpanded) {
            return !collapsedGroups.value.has(id);
        } else {
            return expandedGroups.value.has(id);
        }
    };

    /*  Filtering Logic */
    const filterableColumns = columns.value.filter((column) => column.filterable);
    // Dynamically generate filter state for each filterable column
    // Empty set means all items are selected (visible)
    const columnFilters = ref(Object.fromEntries(filterableColumns.map((column) => [column.name, new Set<string>()])) as Record<string, Set<string>>);

    /*
    - Cache unique values for each filterable column to optimize filter dropdowns.
    - This cache is updated whenever the items or filters change.
    - The logic ensures that if an item is filtered out by one column, its values are not
    counted in the unique values of other columns, except for the column that filtered it out.
    This provides a more intuitive filtering experience.
     */
    const uniqueValuesCache = computed(() => {
        const cache = new Map<string, Set<any>>();
        filterableColumns.forEach((column) => cache.set(column.name, new Set()));

        for (const item of props.items) {
            const itemValues = new Map<string, any>();
            const failingColumns: string[] = [];

            for (const column of filterableColumns) {
                const val = column.value(item);
                itemValues.set(column.name, val);

                const filterSet = columnFilters.value[column.name];
                if (filterSet && filterSet.has(val)) {
                    failingColumns.push(column.name);
                }
            }

            if (failingColumns.length === 0) {
                filterableColumns.forEach((column) => {
                    cache.get(column.name)?.add(itemValues.get(column.name));
                });
            } else if (failingColumns.length === 1) {
                const colName = failingColumns[0];
                cache.get(colName)?.add(itemValues.get(colName));
            }
        }
        return cache;
    });

    // Filter jobs based on column filters
    const filteredItems = computed(() => {
        return props.items.filter((item) => {
            return filterableColumns.every((column) => {
                const filterSet = columnFilters.value[column.name];
                if (!filterSet) return true;

                const value = column.value(item);
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

        // Clear and add all values except the selected one
        filterSet.clear();
        allValues.forEach((v) => {
            if (v !== value) {
                filterSet.add(v);
            }
        });
    };
</script>

<template>
    <div class="virtual-table">
        <!-- Fixed Header Area -->
        <div
            class="virtual-table__header"
            :style="gridStyle"
        >
            <slot name="header">
                <template
                    v-for="column in columns"
                    :key="`header-${column.name}`"
                >
                    <ColumnHeader
                        :title="column.name"
                        :available-values="Array.from(uniqueValuesCache.get(column.name) ?? [])"
                        :hidden-values="columnFilters[column.name]"
                        @toggle-filter="toggleFilter(column.name, $event)"
                        @clear-filter="clearColumnFilter(column.name)"
                        @select-only="selectOnlyFilter(column.name, $event)"
                    />
                </template>
            </slot>
            <v-progress-linear
                :active="loading"
                indeterminate
                color="primary"
                height="2"
                absolute
                location="bottom"
            />
        </div>

        <!-- Virtual Scroller -->
        <v-virtual-scroll
            :items="filteredItems"
            :height="height"
            class="virtual-table__scroller"
            @scroll="onScroll"
        >
            <template v-slot:default="{item}">
                <div class="group-wrapper">
                    <!-- Group Header Row -->
                    <div
                        class="grid group-row"
                        :style="gridStyle"
                        @click="toggleGroup(item.run.id)"
                        :class="{expanded: isExpanded(item.run.id)}"
                    >
                        <div class="col-expand">
                            <v-icon
                                :icon="isExpanded(item.run.id) ? '$expand' : '$next'"
                                size="x-small"
                            />
                        </div>
                        <div
                            v-for="column in columns.slice(1)"
                            :class="`col-${column.name} text-truncate`"
                        >
                            <slot
                                :name="`item.${column.name}`"
                                :item="item"
                                :value="column.value(item)"
                                type="group"
                            >
                                {{ column.scope === 'group' || column.scope === 'both' ? column.value(item) : '' }}
                            </slot>
                        </div>
                    </div>

                    <!-- Job Rows (Rendered only if expanded) -->
                    <div
                        v-if="isExpanded(item.run.id)"
                        class="rows-container"
                    >
                        <div
                            v-for="job in item.jobs.values()"
                            :key="job.id"
                            class="grid item-row"
                            :style="gridStyle"
                            @click.stop="onJobClick ? onJobClick(job) : null"
                        >
                            <div
                                v-for="column in columns"
                                :class="`col-${column.name} text-truncate`"
                            >
                                <slot
                                    :name="`item.${column.name}`"
                                    :item="job"
                                    :value="column.value(job)"
                                    type="row"
                                >
                                    {{ column.scope === 'row' || column.scope === 'both' ? column.value(job) : '' }}
                                </slot>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
        </v-virtual-scroll>
    </div>
</template>

<style scoped>
    .virtual-table {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
    }

    .virtual-table__header {
        flex-shrink: 0;
        background: rgb(var(--v-theme-surface));
        z-index: 1;
        border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        position: relative;
        min-height: 48px;
    }

    .virtual-table__scroller {
        flex-grow: 1;
    }

    .grid {
        display: grid;
        grid-template-columns: 40px 2fr 2fr 2fr 1.5fr 1fr 1.5fr;
        gap: 8px;
        align-items: center;
        padding: 0 16px;
    }

    .group-row {
        height: 48px;
        cursor: pointer;
        background-color: rgb(var(--v-theme-surface));
        border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        transition: background-color 0.2s;
    }

    .group-row:hover {
        background-color: rgba(var(--v-theme-on-surface), 0.05);
    }

    .header-cell {
        font-weight: bold;
        font-size: 0.875rem;
        color: rgba(var(--v-theme-on-surface), 0.6);
    }

    .item-row {
        height: 40px;
        cursor: pointer;
        font-size: 0.875rem;
        border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    }

    .item-row:hover {
        background-color: rgba(var(--v-theme-on-surface), 0.05);
    }

    .rows-container {
        background-color: rgba(var(--v-theme-on-surface), 0.02);
    }

    /* Column specific styles */
    .col-expand {
        display: flex;
        justify-content: center;
    }

    .text-truncate {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
