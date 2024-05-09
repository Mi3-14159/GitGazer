<script setup lang="ts">
import type { Job } from "../types";

const props = defineProps<{
  job: Job;
}>();
</script>

<template>
  <v-sheet class="pa-2 ma-2" :class="job.workflow_job.conclusion ?? job.action">
    <h3>
      {{ props.job.repository.full_name }} - {{ props.job.workflow_name }}
    </h3>
    <p><strong>Run ID:</strong> {{ props.job.run_id }}</p>
    <p><strong>State:</strong> {{ props.job.action }}</p>
    <p><strong>Conclusion</strong> {{ props.job.workflow_job.conclusion }}</p>
  </v-sheet>
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
