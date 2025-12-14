<script setup lang="ts">
    import ColumnHeader from '@/components/ColumnHeader.vue';
    import WorkflowCard from '@/components/WorkflowCard.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useJobsStore} from '@/stores/jobs';
    import {Job} from '@common/types';
    import type {WorkflowJobEvent} from '@octokit/webhooks-types';
    import {storeToRefs} from 'pinia';
    import {computed, onMounted, reactive, ref, watch} from 'vue';
    import {useDisplay} from 'vuetify';

    const jobsStore = useJobsStore();
    const {initializeStore} = jobsStore;
    const {jobs, isLoading} = storeToRefs(jobsStore);

    const {smAndDown} = useDisplay();
    const selectedJob = ref<Job<WorkflowJobEvent> | null>(null);
    const uniqueValuesCache = reactive(new Map<string, Set<string>>());

    // Table headers for desktop view
    const headers = [
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
            value: (item: Job<WorkflowJobEvent>) =>
                item.workflow_event?.workflow_job?.conclusion || item.workflow_event?.workflow_job?.status || 'unknown',
            filterableColumn: true,
            sortable: true,
        },
        {title: 'Created', key: 'created_at', value: (item: Job<WorkflowJobEvent>) => item.created_at, filterableColumn: false, sortable: true},
    ];

    const sortBy = ref([{key: 'created_at', order: 'desc' as const}]);

    const filterableColumns = headers.filter((header) => header.filterableColumn);

    watch(
        jobs,
        (newJobs) => {
            filterableColumns.forEach((column) => {
                const values = new Set<string>();
                for (const job of newJobs) {
                    values.add((column.value(job) as string) || 'unknown');
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
    const filteredJobs = computed(() => {
        return jobs.value.filter((job) => {
            // Check each filterable column
            return filterableColumns.every((column) => {
                const filterSet = columnFilters[column.key];
                if (!filterSet) return true;

                const value = (column.value(job) as string) || 'unknown';
                return !filterSet.has(value);
            });
        });
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

    // Group jobs by workflow for mobile card view
    const groupedJobs = computed(() => {
        const groups = new Map<number, {repository_full_name: string; jobs: Job<WorkflowJobEvent>[]; workflow_name: string; head_branch: string}>();

        for (const job of jobs.value) {
            const key = job.workflow_event.workflow_job.run_id;
            if (!groups.has(key))
                groups.set(key, {
                    repository_full_name: job.workflow_event.repository.full_name,
                    jobs: [],
                    workflow_name: job.workflow_event.workflow_job.workflow_name!,
                    head_branch: job.workflow_event.workflow_job.head_branch || 'unknown',
                });
            groups.get(key)?.jobs.push(job);
        }

        groups.forEach(({jobs}) => {
            jobs.sort(
                (a, b) => new Date(b.workflow_event.workflow_job.created_at).getTime() - new Date(a.workflow_event.workflow_job.created_at).getTime(),
            );
        });

        return Array.from(groups.entries())
            .map(([run_id, {repository_full_name, jobs, workflow_name, head_branch}]) => ({
                run_id,
                repository_full_name,
                jobs,
                workflow_name,
                head_branch,
            }))
            .reverse();
    });

    onMounted(async () => {
        await initializeStore();
    });
</script>

<template>
    <v-main>
        <!-- Loading Spinner - Only show during initial load -->
        <div
            v-if="isLoading"
            class="d-flex justify-center align-center"
            style="min-height: 300px"
        >
            <v-progress-circular
                indeterminate
                size="30"
                color="primary"
            />
        </div>

        <!-- Desktop Table View -->
        <div v-else-if="!smAndDown">
            <v-data-table
                :headers="headers"
                :items="filteredJobs"
                item-key="id"
                class="elevation-1"
                density="compact"
                :items-per-page="50"
                :items-per-page-options="[10, 25, 50, 100]"
                v-model:sort-by="sortBy"
                @click:row="(_: any, {item}: {item: Job<WorkflowJobEvent>}) => viewJob(item)"
            >
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
            </v-data-table>
        </div>

        <!-- Mobile Card View -->
        <div v-else>
            <v-row
                align="start"
                v-for="job in groupedJobs"
                :key="job.run_id"
                no-gutters
            >
                <WorkflowCard
                    :run_id="job.run_id"
                    :repository_full_name="job.repository_full_name"
                    :workflow_name="job.workflow_name"
                    :jobs="job.jobs"
                />
            </v-row>
        </div>

        <!-- Job Details Dialog -->
        <WorkflowCardDetails
            :job="selectedJob"
            @update:job="selectedJob = $event"
        />
    </v-main>
</template>

<style scoped>
    .group-header {
        background-color: #f5f5f5;
        border-bottom: 2px solid #e0e0e0;
    }

    .group-header td {
        font-weight: 600;
        color: #424242;
    }

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
