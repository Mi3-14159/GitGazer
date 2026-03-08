<script setup lang="ts">
    import {WorkflowJob, WorkflowRunWithRelations} from '@common/types';
    import {computed} from 'vue';

    const props = defineProps<{
        job: WorkflowJob | null;
        run: WorkflowRunWithRelations | undefined;
    }>();

    const emit = defineEmits<{(e: 'update:job', value: WorkflowJob | null): void}>();

    // Use a computed property to control the dialog visibility.
    const dialog = computed({
        get: () => Boolean(props.job),
        set: (val: boolean) => {
            if (!val) emit('update:job', null);
        },
    });

    // Helper functions
    const getJobStatus = (job: WorkflowJob) => {
        return job.conclusion || job.status || 'In Progress';
    };

    const formatJobTime = (job: WorkflowJob) => {
        const date = new Date(job.createdAt);
        return date.toLocaleString();
    };

    const getGitHubWebUrl = (job: WorkflowJob, run?: WorkflowRunWithRelations | null) => {
        if (!run) return '';
        return `https://github.com/${run.repository.owner?.login}/${run.repository.name}/actions/runs/${job.runId}`;
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
                            :model-value="props.run?.repository.name"
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
                            :model-value="props.job.workflowName"
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
                            :model-value="props.job.name"
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
                            :model-value="props.job.runId"
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
                            :model-value="props.job.id"
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
                            :model-value="props.job.headBranch"
                            readonly
                            variant="outlined"
                            density="compact"
                        ></v-text-field>
                    </v-col>

                    <v-col cols="12">
                        <v-text-field
                            label="GitHub URL"
                            :model-value="getGitHubWebUrl(props.job, props.run)"
                            readonly
                            variant="outlined"
                            density="compact"
                            append-inner-icon="mdi-open-in-new"
                            @click:append-inner="openUrl(getGitHubWebUrl(props.job, props.run))"
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
