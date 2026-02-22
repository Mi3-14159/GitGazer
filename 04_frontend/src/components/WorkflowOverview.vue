<script setup lang="ts">
    import VirtualTable, {type HeaderColumn} from '@/components/VirtualTable.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useWorkflowsStore, WorkflowGroup} from '@/stores/workflows';
    import {Event, WorkflowJobEvent} from '@common/types';
    import {storeToRefs} from 'pinia';
    import {onMounted, ref} from 'vue';

    const workflowsStore = useWorkflowsStore();
    const {initializeStore, handleListWorkflows} = workflowsStore;
    const {workflows, isLoading} = storeToRefs(workflowsStore);
    const selectedJob = ref<Event<WorkflowJobEvent> | null>(null);

    const headerConfig: HeaderColumn[] = [
        {
            name: 'Repository',
            scope: 'group',
            width: '2fr',
            value: (item: WorkflowGroup) => item.run?.event?.repository.full_name,
            filterable: true,
        },
        {
            name: 'Workflow',
            scope: 'group',
            width: '2fr',
            value: (item: WorkflowGroup) => item.run?.event?.workflow_run.name,
            filterable: true,
        },
        {
            name: 'Job Name',
            scope: 'row',
            width: '2fr',
            value: (item: Event<WorkflowJobEvent>) => item.event?.workflow_job.name,
            filterable: false,
        },
        {
            name: 'Branch',
            scope: 'group',
            width: '1.5fr',
            value: (item: WorkflowGroup) => item.run?.event?.workflow_run.head_branch,
            filterable: true,
        },
        {
            name: 'Status',
            scope: 'both',
            width: '1fr',
            value: (item: WorkflowGroup | Event<WorkflowJobEvent>) => {
                if ('run' in item && item.run) {
                    return item.run.event?.workflow_run.conclusion || item.run.event?.workflow_run.status;
                } else if ('event' in item && item.event) {
                    return item.event?.workflow_job.conclusion || item.event?.workflow_job.status;
                }
                return 'unknown';
            },
            filterable: true,
        },
        {
            name: 'Created',
            scope: 'both',
            width: '1.5fr',
            value: (item: WorkflowGroup | Event<WorkflowJobEvent>) => {
                if ('run' in item && item.run) {
                    return new Date(item.run.created_at).toLocaleString();
                } else if ('event' in item && item.event) {
                    return new Date(item.created_at).toLocaleString();
                }
                return 'unknown';
            },
        },
    ];

    const onJobClick = (job: Event<WorkflowJobEvent>) => {
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
                    variant="flat"
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
