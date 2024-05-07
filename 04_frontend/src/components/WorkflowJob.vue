<script setup lang="ts">
import type { Job } from '@/types'

const props = defineProps<{
    job: Job
}>()
</script>

<template>
    <div class="github-workflow-job">
        <h1>{{ props.job.workflow_name }}</h1>
        <p><strong>Action:</strong> {{ props.job.action }}</p>
        <p><strong>Run ID:</strong> {{ props.job.run_id }}</p>
    </div>
</template>

<style scoped>
.github-workflow-job h1 {
    color: #0366d6;
}
.github-workflow-job p {
    font-size: 16px;
    color: #333;
}
</style>
