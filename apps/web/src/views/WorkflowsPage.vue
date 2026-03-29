<script setup lang="ts">
    import DateTimeRangePicker from '@/components/filters/DateTimeRangePicker.vue';
    import PageHeader from '@/components/PageHeader.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import WorkflowCardDetails from '@/components/workflows/WorkflowCardDetails.vue';
    import WorkflowTable from '@/components/workflows/WorkflowTable.vue';
    import WorkflowToolbar from '@/components/workflows/WorkflowToolbar.vue';
    import {useWorkflowFilters} from '@/composables/useWorkflowFilters';
    import {useWorkflowsStore} from '@/stores/workflows';
    import type {WorkflowJob, WorkflowRunWithRelations} from '@common/types';
    import {storeToRefs} from 'pinia';
    import {computed, onMounted, onUnmounted, ref} from 'vue';
    import {useRouter} from 'vue-router';

    const workflowsStore = useWorkflowsStore();
    const {initializeStore, handleListWorkflows, setFilters} = workflowsStore;
    const {workflows, isLoading, hasMore} = storeToRefs(workflowsStore);

    const router = useRouter();

    const {
        dateRange,
        savedViews,
        currentView,
        updateColumns,
        saveView,
        deleteView,
        changeView,
        buildApiFilters,
        buildInitialQuery,
        getActiveFilterValues,
        handleColumnFilterChange,
    } = useWorkflowFilters({setFilters});

    const selectedJob = ref<WorkflowJob | null>(null);
    const expandedRuns = ref<Set<number>>(new Set());

    onMounted(async () => {
        await router.replace({query: buildInitialQuery()});
        const {apiFilters} = buildApiFilters();
        await initializeStore(apiFilters);
        window.addEventListener('scroll', handleScroll);
    });

    onUnmounted(() => {
        window.removeEventListener('scroll', handleScroll);
    });

    const allRuns = computed(() => workflows.value.filter((run) => run.workflowJobs?.length > 0));
    const runs = computed(() => allRuns.value);
    const visibleColumns = computed(() => currentView.value.columns.filter((c) => c.visible));

    function getColumnValue(workflow: WorkflowRunWithRelations, columnId: string): string {
        switch (columnId) {
            case 'workflow':
                return workflow.name;
            case 'repository':
                return workflow.repository?.name ?? '';
            case 'branch':
                return workflow.headBranch;
            case 'status':
                return workflow.conclusion || workflow.status || '';
            case 'actor':
                return workflow.headCommitAuthorName;
            case 'commit':
                return workflow.headCommitMessage?.slice(0, 40) ?? '';
            case 'run_number':
                return workflow.runAttempt?.toString() ?? '';
            case 'topics':
                return (workflow.repository?.topics ?? []).join(', ');
            default:
                return '';
        }
    }

    function getColumnValues(workflow: WorkflowRunWithRelations, columnId: string): string[] {
        switch (columnId) {
            case 'topics':
                return workflow.repository?.topics ?? [];
            default:
                return [getColumnValue(workflow, columnId)];
        }
    }

    function toggleRun(id: number) {
        const s = new Set(expandedRuns.value);
        if (s.has(id)) s.delete(id);
        else s.add(id);
        expandedRuns.value = s;
    }

    function onJobClick(job: WorkflowJob) {
        selectedJob.value = job;
    }

    function getRunOfSelectedJob() {
        return workflows.value.find((run) => run.workflowJobs.some((job) => job.id === selectedJob.value?.id));
    }

    function handleScroll() {
        const scrollY = window.scrollY;
        const windowHeight = window.innerHeight;
        const docHeight = document.documentElement.scrollHeight;
        if (scrollY + windowHeight >= docHeight - 200) {
            if (!isLoading.value && hasMore.value) {
                handleListWorkflows();
            }
        }
    }
</script>

<template>
    <div class="space-y-4 p-4">
        <!-- Description + Date Range -->
        <PageHeader
            description="Complete workflow history with infinite scrolling"
            class="shrink-0"
        >
            <DateTimeRangePicker v-model:date-range="dateRange" />
        </PageHeader>

        <!-- Toolbar -->
        <WorkflowToolbar
            :current-view="currentView"
            :saved-views="savedViews"
            @view-change="changeView"
            @save-view="saveView"
            @delete-view="deleteView"
            @update:columns="updateColumns"
        />

        <!-- Loading skeleton -->
        <div
            v-if="isLoading && allRuns.length === 0"
            class="space-y-3"
        >
            <Skeleton
                v-for="i in 5"
                :key="i"
                class="h-12 w-full"
            />
        </div>

        <!-- Table -->
        <WorkflowTable
            v-else
            :runs="runs"
            :visible-columns="visibleColumns"
            :expanded-runs="expandedRuns"
            :is-loading="isLoading"
            :has-more="hasMore"
            :total-count="allRuns.length"
            :get-column-value="getColumnValue"
            :get-column-values="getColumnValues"
            :get-active-filter-values="getActiveFilterValues"
            @toggle-run="toggleRun"
            @job-click="onJobClick"
            @filter-change="handleColumnFilterChange"
        />

        <!-- Job details dialog -->
        <WorkflowCardDetails
            v-if="selectedJob"
            :job="selectedJob"
            :run="getRunOfSelectedJob()"
            @update:job="selectedJob = $event"
        />
    </div>
</template>
