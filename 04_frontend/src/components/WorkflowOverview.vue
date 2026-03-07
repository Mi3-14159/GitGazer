<script setup lang="ts">
    import VirtualTable, {type HeaderColumn} from '@/components/VirtualTable.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useWorkflowsStore, WorkflowGroup} from '@/stores/workflows';
    import {WorkflowJob} from '@common/types';
    import {storeToRefs} from 'pinia';
    import {onMounted, ref} from 'vue';

    const workflowsStore = useWorkflowsStore();
    const {initializeStore, handleListWorkflows} = workflowsStore;
    const {workflows, isLoading, hasMore} = storeToRefs(workflowsStore);
    const selectedJob = ref<WorkflowJob | null>(null);

    const headerConfig: HeaderColumn[] = [
        {
            name: 'Repository',
            scope: 'group',
            width: '2fr',
            value: (item: WorkflowGroup) => item.run?.repository.fullName,
            filterable: true,
        },
        {
            name: 'Workflow',
            scope: 'group',
            width: '2fr',
            value: (item: WorkflowGroup) => item.run?.name,
            filterable: true,
        },
        {
            name: 'Job Name',
            scope: 'row',
            width: '2fr',
            value: (item: WorkflowJob) => item.name,
            filterable: false,
        },
        {
            name: 'Branch',
            scope: 'group',
            width: '1.5fr',
            value: (item: WorkflowGroup) => item.run?.headBranch,
            filterable: true,
        },
        {
            name: 'Status',
            scope: 'both',
            width: '1fr',
            value: (item: WorkflowGroup | WorkflowJob) => {
                if ('run' in item && item.run) {
                    return item.run?.conclusion || item.run?.status;
                } else if ('conclusion' in item && item.conclusion) {
                    return item.conclusion || item.status;
                }
                return 'unknown';
            },
            filterable: true,
        },
        {
            name: 'Created',
            scope: 'both',
            width: '1.5fr',
            value: (item: WorkflowGroup | WorkflowJob) => {
                if ('run' in item && item.run) {
                    return new Date(item.run.createdAt).toLocaleString();
                } else if ('createdAt' in item && item.createdAt) {
                    return new Date(item.createdAt).toLocaleString();
                }
                return 'unknown';
            },
        },
    ];

    const onJobClick = (job: WorkflowJob) => {
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
            :has-more="hasMore"
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
            :run="workflows.find((group) => group.jobs.get(selectedJob?.id ?? -1) === selectedJob)?.run || null"
            @update:job="selectedJob = $event"
        />
    </v-main>
</template>

<style scoped>
    .workflow-table {
        height: 100vh;
    }
</style>
