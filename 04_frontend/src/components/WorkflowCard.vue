<script setup lang="ts">
    import {ref} from 'vue';
    import type {GitGazerWorkflowJobEvent} from '../queries';
    import WorkflowCardDetails from './WorkflowCardDetails.vue';
    // Accept either a single job or a group of jobs, plus workflow_name in group view
    const props = defineProps<{
        run_id: number;
        repository_full_name?: string;
        jobs: GitGazerWorkflowJobEvent[];
        workflow_name?: string;
    }>();

    // For group view: selected job to view
    const selectedJob = ref<GitGazerWorkflowJobEvent | null>(null);
</script>

<template>
    <!-- Group view: when group props (run_id, repository_full_name, jobs) are provided -->
    <template v-if="run_id && repository_full_name && jobs">
        <v-card class="ma-2 rounded-lg">
            <v-card-title class="card-title-wrap">
                <a
                    :href="`https://github.com/${repository_full_name}`"
                    target="_blank"
                    rel="noopener"
                    class="breakable-link"
                >
                    {{ repository_full_name }}
                </a>
                > {{ workflow_name }} /
                <a
                    :href="`https://github.com/${repository_full_name}/actions/runs/${run_id}`"
                    target="_blank"
                    rel="noopener"
                    class="breakable-link"
                >
                    {{ run_id }}
                </a>
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text>
                <v-row
                    dense
                    align="center"
                    justify="start"
                >
                    <v-col
                        cols="auto"
                        v-for="job in jobs"
                        :key="job.workflow_job_event.workflow_job.id"
                    >
                        <!-- Display job name clickable to open details with a border and status-based bg color -->
                        <div
                            class="job-badge"
                            :class="job.workflow_job_event.workflow_job.conclusion ?? job.workflow_job_event.workflow_job.status"
                            @click="selectedJob = job"
                        >
                            {{ job.workflow_job_event.workflow_job.name }}
                        </div>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>
        <!-- Use the new WorkflowCardDetails component -->
        <WorkflowCardDetails v-model:job="selectedJob" />
    </template>
</template>

<style scoped>
    .job-badge {
        /* common border styles */
        border: 1px solid #000;
        padding: 4px;
        border-radius: 4px;
        margin: 4px 0;
        cursor: pointer;
        text-align: center;
    }
    .queued {
        background-color: #f0ad4e;
    }
    .in_progress {
        background-color: #5bc0de;
    }
    .success {
        background-color: #5cb85c;
    }
    .failure {
        background-color: #d9534f;
    }
    .cancelled {
        background-color: #413e3e;
    }

    a {
        color: inherit;
    }

    .card-title-wrap {
        word-wrap: break-word;
        word-break: break-word;
        white-space: normal;
        line-height: 1.4;
        flex-wrap: wrap;
    }

    .breakable-link {
        word-break: break-all;
        display: inline-block;
        max-width: 100%;
    }
</style>
