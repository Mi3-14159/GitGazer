<script setup lang="ts" generic="T">
    import ColumnHeader from '@/components/ColumnHeader.vue';
    import {useScrollbarObserver} from '@/composables/useScrollbarObserver';
    import {useTableFiltering, type FilterableColumn} from '@/composables/useTableFiltering';
    import {WorkflowGroup} from '@/stores/jobs';
    import {Job, WorkflowJobEvent} from '@common/types';
    import {computed, ref, toRef, type ComponentPublicInstance} from 'vue';

    export interface HeaderColumn<T = any> extends FilterableColumn<T> {
        scope: 'group' | 'row' | 'both';
        width?: string;
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

    /* Filtering Logic */
    const {columnFilters, uniqueValuesCache, filteredItems, toggleFilter, clearColumnFilter, selectOnlyFilter} = useTableFiltering(
        toRef(props, 'items'),
        columns,
    );

    /* Infinite Scroll Logic */
    const onScroll = (e: Event) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        if (target.scrollTop + target.clientHeight >= target.scrollHeight - props.threshold && !props.loading) {
            props.loadMore?.();
        }
    };

    /* Scrollbar Observer */
    const scrollerRef = ref<ComponentPublicInstance | null>(null);
    const {hasScrollbar} = useScrollbarObserver(scrollerRef);

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
            ref="scrollerRef"
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

        <div
            v-if="loadMore && !hasScrollbar"
            class="virtual-table__footer pa-2"
        >
            <v-btn
                block
                variant="text"
                :loading="loading"
                @click="loadMore"
            >
                Load More
            </v-btn>
        </div>
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

    .virtual-table__footer {
        flex-shrink: 0;
        background: rgb(var(--v-theme-surface));
        border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    }

    .virtual-table__scroller {
        flex-grow: 1;
    }

    .grid {
        display: grid;
        /* grid-template-columns: 40px 2fr 2fr 2fr 1.5fr 1fr 1.5fr; */
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
        font-size: 0.875rem;
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
