<script setup lang="ts">
    import VirtualTable from '@/components/VirtualTable.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useJobsStore} from '@/stores/jobs';
    import {Job, WorkflowJobEvent} from '@common/types';
    import {storeToRefs} from 'pinia';
    import {computed, onMounted, ref} from 'vue';

    const jobsStore = useJobsStore();
    const {initializeStore, handleListJobs} = jobsStore;
    const {workflows, isLoading} = storeToRefs(jobsStore);
    const useCollapsedInsteadOfExpanded = false;

    const selectedJob = ref<Job<WorkflowJobEvent> | null>(null);
    const expandedGroups = ref<Set<string>>(new Set());
    const collapsedGroups = ref<Set<string>>(new Set());

    // Convert Map to Array for the virtual scroller
    const groups = computed(() => {
        return Array.from(workflows.value.values())
            .map((group) => ({
                ...group,
                id: group.run.id,
            }))
            .sort((a, b) => {
                const timeA = a.run.created_at ? new Date(a.run.created_at).getTime() : 0;
                const timeB = b.run.created_at ? new Date(b.run.created_at).getTime() : 0;
                return timeB - timeA;
            });
    });

    const toggleGroup = (id: string) => {
        if (expandedGroups.value.has(id)) {
            expandedGroups.value.delete(id);
        } else {
            expandedGroups.value.add(id);
        }

        if (collapsedGroups.value.has(id)) {
            collapsedGroups.value.delete(id);
        } else {
            collapsedGroups.value.add(id);
        }
    };

    const isExpanded = (id: string) => {
        if (useCollapsedInsteadOfExpanded) {
            return !collapsedGroups.value.has(id);
        } else {
            return expandedGroups.value.has(id);
        }
    };

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

    const onJobClick = (job: Job<WorkflowJobEvent>) => {
        selectedJob.value = job;
    };

    onMounted(async () => {
        await initializeStore();
    });
</script>

<template>
    <v-main class="fill-height">
        <VirtualTable
            :items="groups"
            :loading="isLoading"
            @load-more="handleListJobs"
            class="workflow-table"
        >
            <template #header>
                <div class="workflow-grid header-row">
                    <div class="col-expand"></div>
                    <div class="col-repo">Repository</div>
                    <div class="col-workflow">Workflow</div>
                    <div class="col-job">Job Name</div>
                    <div class="col-branch">Branch</div>
                    <div class="col-status">Status</div>
                    <div class="col-created">Created</div>
                </div>
            </template>

            <template #row="{item: group}">
                <div class="group-wrapper">
                    <!-- Group Header Row -->
                    <div
                        class="workflow-grid group-row"
                        @click="toggleGroup(group.id)"
                        :class="{expanded: isExpanded(group.id)}"
                    >
                        <div class="col-expand">
                            <v-icon
                                :icon="isExpanded(group.id) ? '$expand' : '$next'"
                                size="x-small"
                            />
                        </div>
                        <div class="col-repo text-truncate">{{ group.run.workflow_event?.repository.full_name }}</div>
                        <div class="col-workflow text-truncate">{{ group.run.workflow_event?.workflow_run.name }}</div>
                        <div class="col-job text-disabled">-</div>
                        <div class="col-branch text-truncate">{{ group.run.workflow_event?.workflow_run.head_branch }}</div>
                        <div class="col-status">
                            <v-chip
                                :color="
                                    getJobStatusColor(
                                        group.run.workflow_event?.workflow_run.conclusion || group.run.workflow_event?.workflow_run.status,
                                    )
                                "
                                size="x-small"
                                variant="flat"
                            >
                                {{ group.run.workflow_event?.workflow_run.conclusion || group.run.workflow_event?.workflow_run.status }}
                            </v-chip>
                        </div>
                        <div class="col-created">
                            {{ new Date(group.run.created_at).toLocaleString() }}
                        </div>
                    </div>

                    <!-- Job Rows (Rendered only if expanded) -->
                    <div
                        v-if="isExpanded(group.id)"
                        class="jobs-container"
                    >
                        <div
                            v-for="job in group.jobs.values()"
                            :key="job.id"
                            class="workflow-grid job-row"
                            @click.stop="onJobClick(job)"
                        >
                            <div class="col-expand"></div>
                            <div class="col-repo"></div>
                            <div class="col-workflow"></div>
                            <div class="col-job text-truncate">{{ job.workflow_event.workflow_job.name }}</div>
                            <div class="col-branch"></div>
                            <div class="col-status">
                                <v-chip
                                    :color="getJobStatusColor(job.workflow_event.workflow_job.conclusion || job.workflow_event.workflow_job.status)"
                                    size="x-small"
                                    variant="flat"
                                >
                                    {{ job.workflow_event.workflow_job.conclusion || job.workflow_event.workflow_job.status }}
                                </v-chip>
                            </div>
                            <div class="col-created">
                                {{ new Date(job.created_at).toLocaleString() }}
                            </div>
                        </div>
                    </div>
                </div>
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

    .workflow-grid {
        display: grid;
        grid-template-columns: 40px 2fr 2fr 2fr 1.5fr 1fr 1.5fr;
        gap: 8px;
        align-items: center;
        padding: 0 16px;
    }

    .header-row {
        font-weight: bold;
        font-size: 0.875rem;
        color: rgba(var(--v-theme-on-surface), 0.6);
        height: 48px;
        border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    }

    .group-row {
        height: 48px;
        cursor: pointer;
        background-color: rgb(var(--v-theme-surface));
        border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        transition: background-color 0.2s;
    }

    .group-row:hover {
        background-color: rgba(var(--v-theme-on-surface), 0.05);
    }

    .job-row {
        height: 40px;
        cursor: pointer;
        font-size: 0.875rem;
        border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    }

    .job-row:hover {
        background-color: rgba(var(--v-theme-on-surface), 0.05);
    }

    .jobs-container {
        background-color: rgba(var(--v-theme-on-surface), 0.02);
    }

    /* Column specific styles */
    .col-expand {
        display: flex;
        justify-content: center;
    }
    .text-truncate {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
