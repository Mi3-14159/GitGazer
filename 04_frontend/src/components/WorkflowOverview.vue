<script setup lang="ts">
    import AutoExpandGroups from '@/components/AutoExpandGroups.vue';
    import ColumnHeader from '@/components/ColumnHeader.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useJobsStore} from '@/stores/jobs';
    import {Job, WorkflowJobEvent} from '@common/types';
    import {storeToRefs} from 'pinia';
    import {computed, onMounted, reactive, ref} from 'vue';

    const jobsStore = useJobsStore();
    const {initializeStore, handleListJobs, getWorkflowRun} = jobsStore;
    const {jobs, isLoading} = storeToRefs(jobsStore);

    const selectedJob = ref<Job<WorkflowJobEvent> | null>(null);

    const rows = computed(() =>
        jobs.value.map((job) => ({
            ...job,
            run_id: job.workflow_event.workflow_job.run_id ?? -1,
        })),
    );

    // Table headers for desktop view
    const headers = [
        // Override default title of the grouping control column
        {title: '', key: 'data-table-group', sortable: false},
        {
            title: 'Repository',
            key: 'full_name',
            value: (item: Job<WorkflowJobEvent>) => item.workflow_event.repository.full_name,
            filterableColumn: true,
            sortable: true,
        },
        {
            title: 'Workflow',
            key: 'workflow_name',
            value: (item: Job<WorkflowJobEvent>) => item.workflow_event.workflow_job.workflow_name,
            filterableColumn: true,
            sortable: true,
        },
        {
            title: 'Job name',
            key: 'name',
            value: (item: Job<WorkflowJobEvent>) => item.workflow_event.workflow_job.name,
            filterableColumn: true,
            sortable: true,
        },
        {
            title: 'Branch',
            key: 'head_branch',
            value: (item: Job<WorkflowJobEvent>) => item.workflow_event.workflow_job.head_branch,
            filterableColumn: true,
            sortable: true,
        },
        {
            title: 'Status',
            key: 'status',
            value: (item: Job<WorkflowJobEvent>) => item.workflow_event.workflow_job.conclusion || item.workflow_event.workflow_job.status,
            filterableColumn: true,
            sortable: true,
        },
        {title: 'Created', key: 'created_at', value: (item: Job<WorkflowJobEvent>) => item.created_at, filterableColumn: false, sortable: true},
    ];

    const sortBy = ref([{key: 'created_at', order: 'desc' as const}]);
    const groupBy = ref([{key: 'run_id', order: 'desc' as const}]);

    const filterableColumns = headers.filter((h: any) => h?.filterableColumn && typeof h.value === 'function') as any[];

    const uniqueValuesByColumn = computed(
        () =>
            Object.fromEntries(
                filterableColumns.map((column) => {
                    const values = new Set<string>(rows.value.map((row) => String(column.value(row))));
                    return [column.key, Array.from(values).sort()];
                }),
            ) as Record<string, string[]>,
    );

    // Dynamically generate filter state for each filterable column
    // Empty set means all items are selected (visible)
    const columnFilters = reactive(
        Object.fromEntries(filterableColumns.map((column) => [column.key, new Set<string>()])) as Record<string, Set<string>>,
    );

    // Filter jobs based on column filters
    const filteredRows = computed(() => {
        return rows.value.filter((row) =>
            filterableColumns.every((column) => {
                const filterSet = columnFilters[column.key];
                if (!filterSet) return true;
                return !filterSet.has(String(column.value(row)));
            }),
        );
    });

    const getGroupRunStatus = (group: any) => {
        const run = getWorkflowRun(group.value)?.workflow_event.workflow_run;
        return run.conclusion || run.status;
    };

    // Toggle filter for a column value
    const toggleFilter = (column: string, value: string) => {
        const filterSet = columnFilters[column];
        if (!filterSet) return;

        if (filterSet.has(value)) {
            filterSet.delete(value);
        } else {
            filterSet.add(value);
        }
    };

    // Clear all filters for a column
    const clearColumnFilter = (column: string) => {
        const filterSet = columnFilters[column];
        if (filterSet) {
            filterSet.clear();
        }
    };

    // Select only one value for a column (hide all others)
    const selectOnlyFilter = (column: string, value: string) => {
        const filterSet = columnFilters[column];
        if (!filterSet) return;

        const allValues = uniqueValuesByColumn.value[column];
        if (!allValues) return;

        // Clear and add all values except the selected one
        filterSet.clear();
        allValues.forEach((v) => {
            if (v !== value) {
                filterSet.add(v);
            }
        });
    };

    const getJobStatusColor = (status: string) => {
        switch (status) {
            case 'success':
                return 'success';
            case 'failure':
            case 'failed':
                return 'error';
            case 'cancelled':
                return 'warning';
            case 'in progress':
            case 'in_progress':
            case 'queued':
                return 'info';
            default:
                return 'default';
        }
    };

    const onRowClick = (_: any, row: any) => {
        const item = (row?.item?.raw ?? row?.item) as Job<WorkflowJobEvent> | undefined;
        if (item) selectedJob.value = item;
    };

    onMounted(async () => {
        await initializeStore();
    });
</script>

<template>
    <v-main>
        <v-data-table-virtual
            fixed-header
            height="100vh"
            :headers="headers"
            :items="filteredRows"
            item-value="id"
            class="elevation-1"
            density="compact"
            hide-default-footer
            disable-pagination
            :sort-by="sortBy"
            :group-by="groupBy"
            @click:row="onRowClick"
            :loading="isLoading"
        >
            <template v-slot:group-header="{item, columns, toggleGroup, isGroupOpen}">
                <tr @click="toggleGroup(item)">
                    <td
                        v-for="(column, idx) in columns"
                        :key="column.key ?? idx"
                    >
                        <template v-if="column.key === 'data-table-group'">
                            <span>
                                <v-icon
                                    size="small"
                                    :icon="isGroupOpen(item) ? '$tableGroupCollapse' : '$tableGroupExpand'"
                                />
                            </span>
                        </template>

                        <template v-else-if="column.key === 'full_name'">
                            <span>{{ getWorkflowRun(item.value).workflow_event.repository.full_name }}</span>
                        </template>

                        <template v-else-if="column.key === 'workflow_name'">
                            <span>{{ getWorkflowRun(item.value).workflow_event.workflow_run.name }}</span>
                        </template>

                        <template v-else-if="column.key === 'head_branch'">
                            <span>{{ getWorkflowRun(item.value).workflow_event.workflow_run.head_branch }}</span>
                        </template>

                        <template v-else-if="column.key === 'status'">
                            <v-chip
                                :color="getJobStatusColor(getGroupRunStatus(item))"
                                size="x-small"
                                variant="flat"
                                :text="getGroupRunStatus(item)"
                            />
                        </template>

                        <template v-else-if="column.key === 'created_at'">
                            <span v-if="getWorkflowRun(item.value).created_at">
                                {{ new Date(getWorkflowRun(item.value).created_at).toLocaleString() }}
                            </span>
                        </template>
                    </td>
                </tr>
            </template>

            <template v-slot:top>
                <AutoExpandGroups :group-ids="filteredRows.map((row) => `root_run_id_${row.run_id}`)" />
            </template>

            <template
                v-slot:loading
                v-if="isLoading && filteredRows.length === 0"
            >
                <v-skeleton-loader type="table-row@10"></v-skeleton-loader>
            </template>

            <template
                v-slot:[`body.append`]
                v-if="!isLoading && filteredRows.length > 0"
            >
                <tr v-intersect.quiet="handleListJobs"></tr>
            </template>

            <!-- Dynamic header filters for filterable columns -->
            <template
                v-for="column in headers"
                :key="`header-${column.key}`"
                #[`header.${column.key}`]="{column: headerColumn, getSortIcon, toggleSort, isSorted}"
            >
                <ColumnHeader
                    :title="headerColumn.title || column.title"
                    :available-values="uniqueValuesByColumn[column.key] ?? []"
                    :hidden-values="columnFilters[column.key]"
                    :sortable="column.sortable"
                    :sort-icon="getSortIcon(headerColumn)"
                    :is-sorted="isSorted(headerColumn)"
                    @toggle-filter="toggleFilter(column.key, $event)"
                    @clear-filter="clearColumnFilter(column.key)"
                    @select-only="selectOnlyFilter(column.key, $event)"
                    @toggle-sort="toggleSort(headerColumn)"
                />
            </template>

            <template v-slot:item.status="{value}">
                <v-chip
                    :color="getJobStatusColor(value)"
                    size="small"
                    variant="flat"
                    :text="value"
                ></v-chip>
            </template>

            <template v-slot:item.created_at="{item}">{{ new Date(item.created_at).toLocaleString() }} </template>
        </v-data-table-virtual>

        <!-- Job Details Dialog -->
        <WorkflowCardDetails
            :job="selectedJob"
            @update:job="selectedJob = $event"
        />
    </v-main>
</template>

<style scoped>
    /* Make data table rows clickable */
    :deep(.v-data-table tbody tr) {
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    :deep(.v-data-table tbody tr:hover) {
        background-color: rgba(0, 0, 0, 0.08) !important;
    }

    /* Prevent text wrapping in table cells */
    :deep(.v-data-table td) {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 0;
    }

    :deep(.v-data-table th) {
        white-space: nowrap;
    }
</style>
