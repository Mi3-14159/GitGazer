<script setup lang="ts">
    import {computed} from 'vue';
    import type {Job} from '../queries';

    const props = defineProps<{
        job: Job;
    }>();

    // Format the created_at timestamp
    const formattedCreatedAt = computed(() => {
        const date = new Date(props.job.workflow_job.created_at);
        return date.toLocaleString([], {dateStyle: 'long', timeStyle: 'short'});
    });
</script>

<template>
    <v-card
        class="ma-2 rounded-lg"
        :class="job.workflow_job.conclusion ?? job.action"
        style="min-width: 500px"
    >
        <v-card-title>{{ props.job.workflow_name }} > {{ props.job.job_name }} </v-card-title>
        <v-card-subtitle>{{ props.job.repository.full_name }}</v-card-subtitle>
        <v-card-text>
            <v-row no-gutters>
                <v-col cols="2">Run ID</v-col>
                <v-col>{{ props.job.run_id }}</v-col>
            </v-row>
            <v-row no-gutters>
                <v-col cols="2">Job ID</v-col>
                <v-col>{{ props.job.job_id }}</v-col>
            </v-row>
            <v-row no-gutters>
                <v-col cols="2">Created at</v-col>
                <v-col>{{ formattedCreatedAt }}</v-col>
            </v-row>
            <v-row no-gutters>
                <v-col cols="2">State</v-col>
                <v-col>{{ props.job.action }}</v-col>
            </v-row>
            <v-row no-gutters>
                <v-col cols="2">Conclusion</v-col>
                <v-col>{{ props.job.workflow_job.conclusion }}</v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>

<style scoped>
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
</style>
