<script setup lang="ts">
    import {computed} from 'vue';
    import type {Job} from '../queries';

    const props = defineProps<{job: Job | null}>();
    const emit = defineEmits<{(e: 'update:job', value: Job | null): void}>();

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
                            :href="`https://github.com/${props.job.repository.full_name}/actions/runs/${props.job.run_id}`"
                            target="_blank"
                            rel="noopener"
                        >
                            {{ props.job.run_id }}
                        </a>
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Job ID:</v-col>
                    <v-col>
                        <a
                            :href="`https://github.com/${props.job.repository.full_name}/actions/runs/${props.job.run_id}/job/${props.job.job_id}`"
                            target="_blank"
                            rel="noopener"
                        >
                            {{ props.job.job_id }}
                        </a>
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Workflow:</v-col>
                    <v-col>{{ props.job.workflow_name }}</v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Job Name:</v-col>
                    <v-col>{{ props.job.job_name }}</v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Repository:</v-col>
                    <v-col>
                        <a
                            :href="`https://github.com/${props.job.repository.full_name}`"
                            target="_blank"
                            rel="noopener"
                            style="color: inherit"
                        >
                            {{ props.job.repository.full_name }}
                        </a>
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Created at:</v-col>
                    <v-col>
                        {{ new Date(props.job.workflow_job.created_at).toLocaleString([], {dateStyle: 'long', timeStyle: 'short'}) }}
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Completed at:</v-col>
                    <v-col>
                        {{ new Date(props.job.workflow_job.completed_at).toLocaleString([], {dateStyle: 'long', timeStyle: 'short'}) }}
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">State:</v-col>
                    <v-col>{{ props.job.action }}</v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col cols="4">Conclusion:</v-col>
                    <v-col>{{ props.job.workflow_job.conclusion }}</v-col>
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
