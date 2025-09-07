<script setup lang="ts">
    import {Job} from '@common/types';
    import WorkflowCard from '@components/WorkflowCard.vue';
    import WorkflowCardDetails from '@components/WorkflowCardDetails.vue';
    import {WorkflowJobEvent} from '@octokit/webhooks-types';
    import {computed, onMounted, onUnmounted, reactive, ref} from 'vue';
    import {useDisplay} from 'vuetify';
    import {useJobs} from '../composables/useJobs';

    const {getJobs, isLoadingJobs} = useJobs();

    const jobs = reactive(new Map<number, Job<WorkflowJobEvent>>());
    const {smAndDown} = useDisplay();
    const selectedJob = ref<Job<WorkflowJobEvent> | null>(null);
    const isInitialLoad = ref(true);

    // Table headers for desktop view
    const headers = [
        {title: 'Repository', value: 'repository_full_name', sortable: true},
        {title: 'Workflow', value: 'workflow_name', sortable: true},
        {title: 'Job Name', value: 'job_name', sortable: true},
        {title: 'Status', value: 'status', sortable: true},
        {title: 'Created', value: 'created_at', sortable: true},
    ];

    // Helper functions for table display
    const getJobStatus = (job: Job<WorkflowJobEvent>) => {
        return job.workflow_job_event.workflow_job.conclusion || job.workflow_job_event.workflow_job.status || 'unknown';
    };

    const getJobStatusColor = (job: Job<WorkflowJobEvent>) => {
        const status = getJobStatus(job).toLowerCase();
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
        const groups = new Map<number, {repository_full_name: string; jobs: Job<WorkflowJobEvent>[]; workflow_name: string}>();

        for (const job of jobs.values()) {
            const key = job.workflow_job_event.workflow_job.run_id;
            if (!groups.has(key))
                groups.set(key, {
                    repository_full_name: job.workflow_job_event.repository.full_name,
                    jobs: [],
                    workflow_name: job.workflow_job_event.workflow_job.workflow_name!,
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
            .map(([run_id, {repository_full_name, jobs, workflow_name}]) => ({run_id, repository_full_name, jobs, workflow_name}))
            .reverse();
    });

    const handleListJobs = async () => {
        const response = await getJobs();

        response.forEach((job: Job<WorkflowJobEvent>) => {
            formatJobTime(job);
            jobs.set(job.job_id, job);
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
                :items="Array.from(jobs.values())"
                item-key="job_id"
                class="elevation-1"
                density="compact"
                :items-per-page="-1"
                :sort-by="[{key: 'created_at', order: 'desc'}]"
            >
                <template v-slot:item="{item}">
                    <tr
                        class="clickable-row"
                        @click="viewJob(item)"
                    >
                        <td>{{ item.workflow_job_event.repository.full_name }}</td>
                        <td>{{ item.workflow_job_event.workflow_job.workflow_name }}</td>
                        <td>{{ item.workflow_job_event.workflow_job.name }}</td>
                        <td>
                            <v-chip
                                :color="getJobStatusColor(item)"
                                size="small"
                                variant="flat"
                            >
                                {{ item.workflow_job_event.workflow_job.status }}
                            </v-chip>
                        </td>
                        <td>{{ item.created_at }}</td>
                    </tr>
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
</style>
