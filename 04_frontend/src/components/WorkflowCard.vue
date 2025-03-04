<script setup lang="ts">
    import {ref} from 'vue';
    import type {Job} from '../queries';
    // Accept either a single job or a group of jobs, plus workflow_name in group view
    const props = defineProps<{
        workflowId?: number;
        repository_full_name?: string;
        jobs?: Job[];
        workflow_name?: string;
    }>();

    // For group view: selected job to view
    const selectedJob = ref<Job | null>(null);
</script>

<template>
    <!-- Group view: when group props (workflowId, repository_full_name, jobs) are provided -->
    <template v-if="workflowId && repository_full_name && jobs">
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
                    :href="`https://github.com/${repository_full_name}/actions/runs/${workflowId}`"
                    target="_blank"
                    rel="noopener"
                    class="breakable-link"
                >
                    {{ workflowId }}
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
                        :key="job.job_id"
                    >
                        <!-- Display job name clickable to open details with a border and status-based bg color -->
                        <div
                            class="job-badge"
                            :class="job.workflow_job.conclusion ?? job.action"
                            @click="selectedJob = job"
                        >
                            {{ job.job_name }}
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
