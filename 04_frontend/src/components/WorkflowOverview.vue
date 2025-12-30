<script setup lang="ts">
    import AutoExpandGroups from '@/components/AutoExpandGroups.vue';
    import ColumnHeader from '@/components/ColumnHeader.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useJobsStore} from '@/stores/jobs';
    import {Job, WorkflowJobEvent, WorkflowRunEvent} from '@common/types';
    import {storeToRefs} from 'pinia';
    import {computed, onMounted, reactive, ref} from 'vue';

    const jobsStore = useJobsStore();
    const {initializeStore, handleListJobs, getWorkflowRun} = jobsStore;
    const {jobs, isLoading} = storeToRefs(jobsStore);

    const UNKNOWN = 'unknown';

    const selectedJob = ref<Job<WorkflowJobEvent> | null>(null);

    type WorkflowRow = Job<WorkflowJobEvent> & {
        full_name: string;
        run_id: number;
        workflow_name: string;
        name: string;
        head_branch: string;
        status: string;
        created_at: string;
    };

    const toRow = (job: Job<WorkflowJobEvent>): WorkflowRow => {
        const status = job.workflow_event?.workflow_job?.conclusion || job.workflow_event?.workflow_job?.status || UNKNOWN;

        return {
            ...job,
            full_name: job.workflow_event.repository.full_name || UNKNOWN,
            run_id: job.workflow_event.workflow_job.run_id ?? -1,
            workflow_name: job.workflow_event.workflow_job.workflow_name || UNKNOWN,
            name: job.workflow_event.workflow_job.name || UNKNOWN,
            head_branch: job.workflow_event.workflow_job.head_branch || UNKNOWN,
            status,
            created_at: job.created_at,
        };
    };

    const allRows = computed(() => jobs.value.map(toRow));

    // Table headers for desktop view
    const headers = [
        // Override default title of the grouping control column
        {title: '', key: 'data-table-group', sortable: false},
        {
            title: 'Repository',
            key: 'full_name',
            value: (item: WorkflowRow) => item.full_name,
            filterableColumn: true,
            sortable: true,
        },
        {
            title: 'Workflow',
            key: 'workflow_name',
            value: (item: WorkflowRow) => item.workflow_name,
            filterableColumn: true,
            sortable: true,
        },
        {
            title: 'Job name',
            key: 'name',
            value: (item: WorkflowRow) => item.name,
            filterableColumn: true,
            sortable: true,
        },
        {
            title: 'Branch',
            key: 'head_branch',
            value: (item: WorkflowRow) => item.head_branch,
            filterableColumn: true,
            sortable: true,
        },
        {
            title: 'Status',
            key: 'status',
            value: (item: WorkflowRow) => item.status,
            filterableColumn: true,
            sortable: true,
        },
        {title: 'Created', key: 'created_at', value: (item: WorkflowRow) => item.created_at, filterableColumn: false, sortable: true},
    ];

    const sortBy = ref([{key: 'created_at', order: 'desc' as const}]);
    const groupBy = ref([{key: 'run_id', order: 'desc' as const}]);

    const filterableColumns = headers.filter((h: any) => h?.filterableColumn && typeof h.value === 'function') as any[];

    const uniqueValuesByColumn = computed(
        () =>
            Object.fromEntries(
                filterableColumns.map((column) => {
                    const values = new Set<string>(allRows.value.map((row) => String(column.value(row) ?? UNKNOWN)));
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
        return allRows.value.filter((row) =>
            filterableColumns.every((column) => {
                const filterSet = columnFilters[column.key];
                if (!filterSet) return true;
                return !filterSet.has(String(column.value(row) ?? UNKNOWN));
            }),
        );
    });

    const getGroupRunJob = (group: any): Job<WorkflowRunEvent> | undefined => {
        const runId = group?.value ?? group?.key;
        if (runId === undefined || runId === null) return undefined;
        return getWorkflowRun(runId);
    };

    const getGroupRunStatus = (group: any) => {
        const run = getGroupRunJob(group)?.workflow_event.workflow_run;
        return run?.conclusion || run?.status || UNKNOWN;
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
        const item = (row?.item?.raw ?? row?.item) as WorkflowRow | undefined;
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
                            <span>{{ getGroupRunJob(item)?.workflow_event.repository.full_name }}</span>
                        </template>

                        <template v-else-if="column.key === 'workflow_name'">
                            <span>{{ getGroupRunJob(item)?.workflow_event.workflow_run.name }}</span>
                        </template>

                        <template v-else-if="column.key === 'head_branch'">
                            <span>{{ getGroupRunJob(item)?.workflow_event.workflow_run.head_branch }}</span>
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
                            <span v-if="getGroupRunJob(item)?.created_at">
                                {{ new Date(getGroupRunJob(item)?.created_at as string).toLocaleString() }}
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
