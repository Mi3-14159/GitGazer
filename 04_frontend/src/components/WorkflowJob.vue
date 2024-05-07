<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

const props = defineProps<{
    action: string
    run_id: number
    workflow_name: string
}>()
</script>

<template>
    <div class="github-workflow-job">
        <h1>{{ props.workflow_name }}</h1>
        <p><strong>Action:</strong> {{ props.action }}</p>
        <p><strong>Run ID:</strong> {{ props.run_id }}</p>
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
