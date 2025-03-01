<script setup lang="ts">
    import type {Job} from '../queries';

    const props = defineProps<{
        job: Job;
    }>();
</script>

<template>
    <v-card
        class="ma-2 rounded-lg"
        :class="job.workflow_job.conclusion ?? job.action"
    >
        <v-card-title>{{ props.job.workflow_name }} > {{ props.job.job_name }} </v-card-title>
        <v-card-subtitle>{{ props.job.repository.full_name }}</v-card-subtitle>
        <v-card-text
            >Run ID: {{ props.job.run_id }}<br />
            Job ID: {{ props.job.job_id }}<br />
            State: {{ props.job.action }}<br />
            Conclusion: {{ props.job.workflow_job.conclusion }}
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
