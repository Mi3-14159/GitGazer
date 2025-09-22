<script setup lang="ts">
    import {Job, ProjectionType} from '@common/types';
    import ColumnFilter from '@components/ColumnFilter.vue';
    import WorkflowCard from '@components/WorkflowCard.vue';
    import WorkflowCardDetails from '@components/WorkflowCardDetails.vue';
    import type {WorkflowJobEvent} from '@octokit/webhooks-types';
    import {computed, onMounted, onUnmounted, reactive, ref} from 'vue';
    import {useDisplay} from 'vuetify';
    import {useJobs} from '../composables/useJobs';

    const {getJobs, isLoadingJobs} = useJobs();

    const jobs = reactive(new Map<number, Job<WorkflowJobEvent>>());
    const {smAndDown} = useDisplay();
    const selectedJob = ref<Job<WorkflowJobEvent> | null>(null);
    const isInitialLoad = ref(true);
    const uniqueValuesCache = reactive(new Map<string, Set<string>>());

    // Table headers for desktop view
    const headers = [
        {
            title: 'Repository',
            key: 'full_name',
            value: (item: Job<WorkflowJobEvent>) => item.workflow_job_event.repository.full_name,
            filterableColumn: true,
        },
        {
            title: 'Workflow',
            key: 'workflow_name',
            value: (item: Job<WorkflowJobEvent>) => item.workflow_job_event.workflow_job.workflow_name,
            filterableColumn: true,
        },
        {title: 'Job name', key: 'name', value: (item: Job<WorkflowJobEvent>) => item.workflow_job_event.workflow_job.name, filterableColumn: true},
        {
            title: 'Branch',
            key: 'head_branch',
            value: (item: Job<WorkflowJobEvent>) => item.workflow_job_event.workflow_job.head_branch,
            filterableColumn: true,
        },
        {
            title: 'Status',
            key: 'status',
            value: (item: Job<WorkflowJobEvent>) =>
                item.workflow_job_event?.workflow_job?.conclusion || item.workflow_job_event?.workflow_job?.status || 'unknown',
            filterableColumn: true,
        },
        {title: 'Created', key: 'created_at', value: (item: Job<WorkflowJobEvent>) => item.created_at, filterableColumn: false},
    ];

    const sortBy = ref([{key: 'created_at', order: 'desc' as const}]);

    // Define which columns should have filters (exclude 'created_at' as it's a timestamp)
    const filterableColumns = headers.filter((header) => header.filterableColumn);

    // Dynamically generate filter state for each filterable column
    const columnFilters = reactive(
        Object.fromEntries(filterableColumns.map((column) => [column.key, new Set<string>()])) as Record<string, Set<string>>,
    );

    // Filter jobs based on column filters
    const filteredJobs = computed(() => {
        return Array.from(jobs.values()).filter((job) => {
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

    const formatJobTime = (job: Job<WorkflowJobEvent>) => {
        const date = new Date(job.created_at);
        job.created_at = date.toLocaleString();
    };

    const viewJob = (job: Job<WorkflowJobEvent>) => {
        selectedJob.value = job;
    };

    // Group jobs by workflow for mobile card view
    const groupedJobs = computed(() => {
        const groups = new Map<number, {repository_full_name: string; jobs: Job<WorkflowJobEvent>[]; workflow_name: string; head_branch: string}>();

        for (const job of jobs.values()) {
            const key = job.workflow_job_event.workflow_job.run_id;
            if (!groups.has(key))
                groups.set(key, {
                    repository_full_name: job.workflow_job_event.repository.full_name,
                    jobs: [],
                    workflow_name: job.workflow_job_event.workflow_job.workflow_name!,
                    head_branch: job.workflow_job_event.workflow_job.head_branch || 'unknown',
                });
            groups.get(key)?.jobs.push(job);
        }

        groups.forEach(({jobs}) => {
            jobs.sort(
                (a, b) =>
                    new Date(b.workflow_job_event.workflow_job.created_at).getTime() -
                    new Date(a.workflow_job_event.workflow_job.created_at).getTime(),
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

    const handleListJobs = async () => {
        const response = await getJobs({limit: 50, projection: ProjectionType.minimal});

        response.forEach((job: Job<WorkflowJobEvent>) => {
            formatJobTime(job);
            jobs.set(job.job_id, job);
            filterableColumns.forEach((column) => {
                const uniqueValues = uniqueValuesCache.get(column.key);
                if (uniqueValues) {
                    uniqueValues.add((column.value(job) as string) || 'unknown');
                } else {
                    uniqueValuesCache.set(column.key, new Set([(column.value(job) as string) || 'unknown']));
                }
            });
        });

        // Mark initial load as complete
        if (isInitialLoad.value) {
            isInitialLoad.value = false;
        }
    };

    // Initial load
    handleListJobs();

    // Set up polling
    let pollingInterval: NodeJS.Timeout;

    onMounted(() => {
        // Poll every 20 seconds
        pollingInterval = setInterval(() => {
            handleListJobs();
        }, 20000);
    });

    onUnmounted(() => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
    });
</script>

<template>
    <v-main>
        <!-- Loading Spinner - Only show during initial load -->
        <div
            v-if="isLoadingJobs && isInitialLoad"
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
                item-key="job_id"
                class="elevation-1"
                density="compact"
                :items-per-page="50"
                :items-per-page-options="[10, 25, 50, 100]"
                v-model:sort-by="sortBy"
                @click:row="(_: any, {item}: {item: Job<WorkflowJobEvent>}) => viewJob(item)"
            >
                <!-- Dynamic header filters for filterable columns -->
                <template
                    v-for="column in filterableColumns"
                    :key="`header-${column.key}`"
                    #[`header.${column.key}`]="{column: headerColumn}"
                >
                    <ColumnFilter
                        :title="headerColumn.title || column.title"
                        :available-values="Array.from(uniqueValuesCache.get(column.key) ?? [])"
                        :hidden-values="columnFilters[column.key]"
                        @toggle-filter="toggleFilter(column.key, $event)"
                        @clear-filter="clearColumnFilter(column.key)"
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
