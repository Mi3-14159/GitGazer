<script setup lang="ts">
import type { Job } from "../types";

const props = defineProps<{
  job: Job;
}>();
</script>

<template>
  <v-sheet class="pa-2 ma-2">
    <h3>
      {{ props.job.repository.full_name }} - {{ props.job.workflow_name }}
    </h3>
    <p><strong>State:</strong> {{ props.job.action }}</p>
    <p><strong>Run ID:</strong> {{ props.job.run_id }}</p>
  </v-sheet>
</template>

<style scoped></style>
