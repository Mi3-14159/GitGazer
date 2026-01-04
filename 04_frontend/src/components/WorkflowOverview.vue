<script setup lang="ts">
    import VirtualTable, {type HeaderColumn} from '@/components/VirtualTable.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useWorkflowsStore} from '@/stores/workflows';
    import {Workflow, WorkflowJobEvent} from '@common/types';
    import {storeToRefs} from 'pinia';
    import {onMounted, ref} from 'vue';

    const workflowsStore = useWorkflowsStore();
    const {initializeStore, handleListWorkflows} = workflowsStore;
    const {workflows, isLoading} = storeToRefs(workflowsStore);
    const selectedJob = ref<Workflow<WorkflowJobEvent> | null>(null);

    const headerConfig: HeaderColumn[] = [
        {
            name: 'Repository',
            scope: 'group',
            width: '2fr',
            value: (item: any) => item.run?.workflow_event?.repository.full_name,
            filterable: true,
        },
        {
            name: 'Workflow',
            scope: 'group',
            width: '2fr',
            value: (item: any) => item.run?.workflow_event?.workflow_run.name,
            filterable: true,
        },
        {
            name: 'Job Name',
            scope: 'row',
            width: '2fr',
            value: (item: any) => item.workflow_event?.workflow_job.name,
            filterable: false,
        },
        {
            name: 'Branch',
            scope: 'group',
            width: '1.5fr',
            value: (item: any) => item.run?.workflow_event?.workflow_run.head_branch,
            filterable: true,
        },
        {
            name: 'Status',
            scope: 'both',
            width: '1fr',
            value: (item: any) =>
                item.run
                    ? item.run.workflow_event?.workflow_run.conclusion || item.run.workflow_event?.workflow_run.status
                    : item.workflow_event?.workflow_job.conclusion || item.workflow_event?.workflow_job.status,
            filterable: true,
        },
        {
            name: 'Created',
            scope: 'both',
            width: '1.5fr',
            value: (item: any) => new Date(item.run ? item.run.created_at : item.created_at).toLocaleString(),
        },
    ];

    const onJobClick = (job: Workflow<WorkflowJobEvent>) => {
        selectedJob.value = job;
    };

    onMounted(async () => {
        await initializeStore();
    });

    const getJobStatusColor = (status: string) => {
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
</script>

<template>
    <v-main class="fill-height">
        <VirtualTable
            :items="workflows"
            :loading="isLoading"
            :header-config="headerConfig"
            :onJobClick="onJobClick"
            :loadMore="handleListWorkflows"
            class="workflow-table"
        >
            <template #item.Status="{value}">
                <v-chip
                    :color="getJobStatusColor(value)"
                    size="small"
                    label
                >
                    {{ value }}
                </v-chip>
            </template>
        </VirtualTable>

        <WorkflowCardDetails
            :job="selectedJob"
            @update:job="selectedJob = $event"
        />
    </v-main>
</template>

<style scoped>
    .workflow-table {
        height: 100vh;
    }
</style>
