<script setup lang="ts">
    import type {GitGazerWorkflowJobEvent} from '@graphql/api';
    import {computed} from 'vue';

    const props = defineProps<{
        job: GitGazerWorkflowJobEvent | null;
    }>();

    const emit = defineEmits<{(e: 'update:job', value: GitGazerWorkflowJobEvent | null): void}>();

    // Use a computed property to control the dialog visibility.
    const dialog = computed({
        get: () => Boolean(props.job),
        set: (val: boolean) => {
            if (!val) emit('update:job', null);
        },
    });

    // Helper functions
    const getJobStatus = (job: GitGazerWorkflowJobEvent) => {
        return job.workflow_job_event.workflow_job.conclusion || job.workflow_job_event.workflow_job.status || 'In Progress';
    };

    const getJobStatusColor = (job: GitGazerWorkflowJobEvent) => {
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

    const formatJobTime = (job: GitGazerWorkflowJobEvent) => {
        const date = new Date(job.workflow_job_event.workflow_job.created_at);
        return date.toLocaleString();
    };

    const getGitHubWebUrl = (job: GitGazerWorkflowJobEvent) => {
        const repoFullName = job.workflow_job_event.repository.full_name;
        const runId = job.workflow_job_event.workflow_job.run_id;
        return `https://github.com/${repoFullName}/actions/runs/${runId}`;
    };

    const openUrl = (url: string) => {
        window.open(url, '_blank');
    };
</script>

<template>
    <v-dialog
        v-model="dialog"
        max-width="800"
    >
        <v-card
            v-if="props.job"
            prepend-icon="mdi-cog"
            title="Job Details"
        >
            <v-card-text>
                <v-row dense>
                    <v-col
                        cols="12"
                        md="6"
                    >
                        <v-text-field
                            label="Repository"
                            :model-value="props.job.workflow_job_event.repository.full_name"
                            readonly
                            variant="outlined"
                            density="compact"
                        ></v-text-field>
                    </v-col>

                    <v-col
                        cols="12"
                        md="6"
                    >
                        <v-text-field
                            label="Workflow"
                            :model-value="props.job.workflow_job_event.workflow_job.workflow_name"
                            readonly
                            variant="outlined"
                            density="compact"
                        ></v-text-field>
                    </v-col>

                    <v-col
                        cols="12"
                        md="6"
                    >
                        <v-text-field
                            label="Job Name"
                            :model-value="props.job.workflow_job_event.workflow_job.name"
                            readonly
                            variant="outlined"
                            density="compact"
                        ></v-text-field>
                    </v-col>

                    <v-col
                        cols="12"
                        md="6"
                    >
                        <v-text-field
                            label="Status"
                            :model-value="getJobStatus(props.job)"
                            readonly
                            variant="outlined"
                            density="compact"
                        >
                        </v-text-field>
                    </v-col>

                    <v-col
                        cols="12"
                        md="6"
                    >
                        <v-text-field
                            label="Created At"
                            :model-value="formatJobTime(props.job)"
                            readonly
                            variant="outlined"
                            density="compact"
                        ></v-text-field>
                    </v-col>

                    <v-col
                        cols="12"
                        md="6"
                    >
                        <v-text-field
                            label="Run ID"
                            :model-value="props.job.workflow_job_event.workflow_job.run_id"
                            readonly
                            variant="outlined"
                            density="compact"
                        ></v-text-field>
                    </v-col>

                    <v-col
                        cols="12"
                        md="6"
                    >
                        <v-text-field
                            label="Job ID"
                            :model-value="props.job.job_id"
                            readonly
                            variant="outlined"
                            density="compact"
                        ></v-text-field>
                    </v-col>

                    <v-col
                        cols="12"
                        md="6"
                    >
                        <v-text-field
                            label="Head Branch"
                            :model-value="props.job.workflow_job_event.workflow_job.head_branch"
                            readonly
                            variant="outlined"
                            density="compact"
                        ></v-text-field>
                    </v-col>

                    <v-col cols="12">
                        <v-text-field
                            label="GitHub URL"
                            :model-value="getGitHubWebUrl(props.job)"
                            readonly
                            variant="outlined"
                            density="compact"
                            append-inner-icon="mdi-open-in-new"
                            @click:append-inner="openUrl(getGitHubWebUrl(props.job))"
                        ></v-text-field>
                    </v-col>
                </v-row>
            </v-card-text>

            <v-divider></v-divider>

            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn
                    text="Close"
                    variant="plain"
                    @click="$emit('update:job', null)"
                ></v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
    /* ...existing styles... */
</style>
