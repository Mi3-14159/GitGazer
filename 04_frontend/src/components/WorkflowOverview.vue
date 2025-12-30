<script setup lang="ts">
    import ColumnHeader from '@/components/ColumnHeader.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useJobsStore} from '@/stores/jobs';
    import {Job, WorkflowJobEvent, WorkflowRunEvent} from '@common/types';
    import {storeToRefs} from 'pinia';
    import {computed, defineComponent, inject, onMounted, reactive, ref, watch, type InjectionKey, type Ref} from 'vue';

    const jobsStore = useJobsStore();
    const {initializeStore, handleListJobs, getWorkflowRun} = jobsStore;
    const {jobs, isLoading} = storeToRefs(jobsStore);

    const selectedJob = ref<Job<WorkflowJobEvent> | null>(null);
    const uniqueValuesCache = reactive(new Map<string, Set<string>>());

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
        const status = job.workflow_event?.workflow_job?.conclusion || job.workflow_event?.workflow_job?.status || 'unknown';

        return {
            ...job,
            full_name: job.workflow_event.repository.full_name || 'unknown',
            run_id: job.workflow_event.workflow_job.run_id ?? -1,
            workflow_name: job.workflow_event.workflow_job.workflow_name || 'unknown',
            name: job.workflow_event.workflow_job.name || 'unknown',
            head_branch: job.workflow_event.workflow_job.head_branch || 'unknown',
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

    const filterableColumns = headers.filter(
        (header): header is (typeof headers)[number] & {value: (item: WorkflowRow) => string} =>
            !!header.filterableColumn && typeof header.value === 'function',
    );

    watch(
        allRows,
        (newRows) => {
            filterableColumns.forEach((column) => {
                const values = new Set<string>();
                for (const row of newRows) {
                    values.add((column.value(row) as string) || 'unknown');
                }
                uniqueValuesCache.set(column.key, values);
            });
        },
        {immediate: true},
    );

    // Dynamically generate filter state for each filterable column
    // Empty set means all items are selected (visible)
    const columnFilters = reactive(
        Object.fromEntries(filterableColumns.map((column) => [column.key, new Set<string>()])) as Record<string, Set<string>>,
    );

    // Filter jobs based on column filters
    const filteredRows = computed(() => {
        return allRows.value.filter((row) => {
            // Check each filterable column
            return filterableColumns.every((column) => {
                const filterSet = columnFilters[column.key];
                if (!filterSet) return true;

                const value = (column.value(row) as string) || 'unknown';
                return !filterSet.has(value);
            });
        });
    });

    const getGroupRepoWorkflow = (
        group: any,
    ): {repository: string; workflow: string; run_status: string; head_branch: string; created_at: string} => {
        const runId = (group?.value ?? group?.key) as number | string | undefined;

        if (runId !== undefined) {
            const runJob = getWorkflowRun(runId) as Job<Partial<WorkflowRunEvent>> | undefined;
            const repoFromRun = runJob?.workflow_event?.repository?.full_name as string | undefined;
            const workflowFromRun = (runJob?.workflow_event as any)?.workflow_run?.name as string | undefined;
            const runStatusFromRun =
                ((runJob?.workflow_event as any)?.workflow_run?.conclusion as string | undefined) ||
                ((runJob?.workflow_event as any)?.workflow_run?.status as string | undefined);
            const branchFromRun = (runJob?.workflow_event as any)?.workflow_run?.head_branch as string | undefined;
            const createdAtFromRun = (runJob?.workflow_event as any)?.workflow_run?.created_at as string | undefined;

            if (repoFromRun || workflowFromRun || runStatusFromRun || branchFromRun || createdAtFromRun) {
                return {
                    repository: repoFromRun || 'unknown',
                    workflow: workflowFromRun || 'unknown',
                    run_status: runStatusFromRun || 'unknown',
                    head_branch: branchFromRun || 'unknown',
                    created_at: createdAtFromRun || 'unknown',
                };
            }

            const fallbackRow = allRows.value.find((row) => String(row.run_id) === String(runId));
            if (fallbackRow) {
                return {
                    repository: fallbackRow.full_name || 'unknown',
                    workflow: fallbackRow.workflow_name || 'unknown',
                    run_status: fallbackRow.status || 'unknown',
                    head_branch: fallbackRow.head_branch || 'unknown',
                    created_at: fallbackRow.created_at || 'unknown',
                };
            }
        }

        return {
            repository: 'unknown',
            workflow: 'unknown',
            run_status: 'unknown',
            head_branch: 'unknown',
            created_at: 'unknown',
        };
    };

    type VDataTableGroupContext = {
        opened: Ref<Set<string>>;
    };

    const VDataTableGroupSymbol = Symbol.for('vuetify:data-table-group') as InjectionKey<VDataTableGroupContext>;

    const AutoExpandGroups = defineComponent({
        name: 'AutoExpandGroups',
        props: {
            groupIds: {
                type: Array as unknown as () => string[],
                required: true,
            },
        },
        setup(props) {
            const group = inject(VDataTableGroupSymbol, null);

            const maybeOpenAll = () => {
                if (!group) return;
                if (group.opened.value.size > 0) return;
                if (props.groupIds.length === 0) return;
                group.opened.value = new Set(props.groupIds);
            };

            onMounted(maybeOpenAll);
            watch(
                () => props.groupIds,
                () => maybeOpenAll(),
                {immediate: true},
            );

            return () => null;
        },
    });

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

        const allValues = uniqueValuesCache.get(column);
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

    const viewJob = (job: Job<WorkflowJobEvent>) => {
        selectedJob.value = job;
    };

    const onRowClick = (_: any, row: any) => {
        const item = (row?.item?.raw ?? row?.item) as WorkflowRow | undefined;
        if (item) viewJob(item);
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
                            <span class="mr-2">
                                <v-icon
                                    size="small"
                                    :icon="isGroupOpen(item) ? '$tableGroupCollapse' : '$tableGroupExpand'"
                                />
                            </span>
                        </template>

                        <template v-else-if="column.key === 'full_name'">
                            <span class="font-weight-medium">{{ getGroupRepoWorkflow(item).repository }}</span>
                        </template>

                        <template v-else-if="column.key === 'workflow_name'">
                            <span>{{ getGroupRepoWorkflow(item).workflow }}</span>
                        </template>

                        <template v-else-if="column.key === 'head_branch'">
                            <span>{{ getGroupRepoWorkflow(item).head_branch }}</span>
                        </template>

                        <template v-else-if="column.key === 'status'">
                            <v-chip
                                :color="getJobStatusColor(getGroupRepoWorkflow(item).run_status)"
                                size="x-small"
                                variant="flat"
                                :text="getGroupRepoWorkflow(item).run_status"
                            />
                        </template>

                        <template v-else-if="column.key === 'created_at'">
                            <span v-if="getGroupRepoWorkflow(item).created_at !== 'unknown'">
                                {{ new Date(getGroupRepoWorkflow(item).created_at).toLocaleString() }}
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
                    :available-values="Array.from(uniqueValuesCache.get(column.key) ?? [])"
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
    .clickable-row {
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .clickable-row:hover {
        background-color: rgba(0, 0, 0, 0.08);
    }

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
