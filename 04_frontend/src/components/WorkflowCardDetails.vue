<script setup lang="ts">
    import {computed} from 'vue';
    import type {GitGazerWorkflowJobEvent} from '../../../02_central/src/graphql/api';

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
</script>

<template>
    <v-dialog
        v-model="dialog"
        max-width="600"
    >
        <v-card v-if="props.job">
            <v-card-title>Job Details</v-card-title>
            <v-card-text>
                <v-row no-gutters>
                    <v-col cols="4">Run ID:</v-col>
                    <v-col>
                        <a
                            :href="`${props.job.workflow_job_event.repository.html_url}/actions/runs/${props.job.workflow_job_event.workflow_job.run_id}`"
                            target="_blank"
                            rel="noopener"
                        >
                            {{ props.job.workflow_job_event.workflow_job.run_id }}
                        </a>
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Job ID:</v-col>
                    <v-col>
                        <a
                            :href="`${props.job.workflow_job_event.repository.html_url}/actions/runs/${props.job.workflow_job_event.workflow_job.run_id}/job/${props.job.job_id}`"
                            target="_blank"
                            rel="noopener"
                        >
                            {{ props.job.job_id }}
                        </a>
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Workflow:</v-col>
                    <v-col>{{ props.job.workflow_job_event.workflow_job.workflow_name }}</v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Job Name:</v-col>
                    <v-col>{{ props.job.workflow_job_event.workflow_job.name }}</v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Repository:</v-col>
                    <v-col>
                        <a
                            :href="`https://github.com/${props.job.workflow_job_event.repository.full_name}`"
                            target="_blank"
                            rel="noopener"
                            style="color: inherit"
                        >
                            {{ props.job.workflow_job_event.repository.full_name }}
                        </a>
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Created at:</v-col>
                    <v-col>
                        {{
                            new Date(props.job.workflow_job_event.workflow_job.created_at).toLocaleString([], {dateStyle: 'long', timeStyle: 'short'})
                        }}
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Completed at:</v-col>
                    <v-col v-if="props.job.workflow_job_event.workflow_job.completed_at">
                        {{
                            new Date(props.job.workflow_job_event.workflow_job.completed_at).toLocaleString([], {
                                dateStyle: 'long',
                                timeStyle: 'short',
                            })
                        }}
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">State:</v-col>
                    <v-col>{{ props.job.workflow_job_event.workflow_job.status }}</v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Conclusion:</v-col>
                    <v-col>{{ props.job.workflow_job_event.workflow_job.conclusion }}</v-col>
                </v-row>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn
                    text
                    @click="$emit('update:job', null)"
                    >Close</v-btn
                >
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
    /* ...existing styles... */
</style>
