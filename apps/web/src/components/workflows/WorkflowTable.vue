<script setup lang="ts">
    import ColumnHeaderFilter from '@/components/workflows/ColumnHeaderFilter.vue';
    import WorkflowTableRow from '@/components/workflows/WorkflowTableRow.vue';
    import type {ColumnConfig} from '@/types/table';
    import {filterableColumnIds} from '@/types/table';
    import type {WorkflowJob, WorkflowRunWithRelations} from '@common/types';

    defineProps<{
        runs: WorkflowRunWithRelations[];
        visibleColumns: ColumnConfig[];
        expandedRuns: Set<number>;
        isLoading: boolean;
        hasMore: boolean;
        totalCount: number;
        getColumnValue: (workflow: WorkflowRunWithRelations, columnId: string) => string;
        getActiveFilterValues: (columnId: string) => string[];
    }>();

    const emit = defineEmits<{
        'toggle-run': [id: number];
        'job-click': [job: WorkflowJob];
        'filter-change': [columnId: string, values: string[]];
    }>();

    const columnWidthClass: Record<string, string> = {
        workflow: 'w-[180px]',
        repository: 'w-[160px]',
        branch: 'w-[120px]',
        status: 'w-[110px]',
        jobs: 'w-[80px]',
        actor: 'w-[140px]',
        duration: 'w-[90px]',
        created: 'w-[130px]',
        started: 'w-[130px]',
        commit: 'w-[180px]',
        run_number: 'w-[80px]',
    };
</script>

<template>
    <div class="border rounded-lg overflow-x-auto min-w-0">
        <table class="w-full min-w-[1050px] table-fixed text-sm">
            <thead class="bg-muted/50 border-b sticky top-0 z-10">
                <tr>
                    <th class="text-left py-2 px-3 font-medium w-8"></th>
                    <th
                        v-for="column in visibleColumns"
                        :key="column.id"
                        :class="['text-left py-2 px-3 font-medium', columnWidthClass[column.id]]"
                    >
                        <div class="flex items-center gap-1">
                            <span>{{ column.label }}</span>
                            <ColumnHeaderFilter
                                v-if="filterableColumnIds.includes(column.id)"
                                :column-id="column.id"
                                :column-label="column.label"
                                :workflows="runs"
                                :active-values="getActiveFilterValues(column.id)"
                                :get-column-value="getColumnValue"
                                @filter-change="emit('filter-change', column.id, $event)"
                            />
                        </div>
                    </th>
                </tr>
            </thead>
            <tbody>
                <WorkflowTableRow
                    v-for="run in runs"
                    :key="run.id"
                    :run="run"
                    :visible-columns="visibleColumns"
                    :expanded="expandedRuns.has(run.id)"
                    @toggle="emit('toggle-run', $event)"
                    @job-click="emit('job-click', $event)"
                />
            </tbody>
        </table>

        <!-- Infinite scroll status -->
        <div class="h-8 flex items-center justify-center">
            <span
                v-if="isLoading"
                class="text-xs text-muted-foreground"
                >Loading more workflows...</span
            >
            <span
                v-else-if="!hasMore && runs.length > 0"
                class="text-xs text-muted-foreground"
            >
                {{ runs.length }} of {{ totalCount }} workflows loaded
            </span>
            <span
                v-else-if="runs.length === 0 && !isLoading"
                class="text-xs text-muted-foreground py-8"
            >
                No workflows match the current filters
            </span>
        </div>
    </div>
</template>
