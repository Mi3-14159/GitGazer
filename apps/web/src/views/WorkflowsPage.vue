<script setup lang="ts">
    import DateTimeRangePicker, {type DateRange} from '@/components/DateTimeRangePicker.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import WorkflowCardDetails from '@/components/workflows/WorkflowCardDetails.vue';
    import WorkflowTable from '@/components/workflows/WorkflowTable.vue';
    import WorkflowToolbar from '@/components/workflows/WorkflowToolbar.vue';
    import {useTableViews} from '@/composables/useTableViews';
    import {useWorkflowsStore} from '@/stores/workflows';
    import {filterableColumnIds} from '@/types/table';
    import type {WorkflowFilters, WorkflowJob, WorkflowRunWithRelations} from '@common/types';
    import {storeToRefs} from 'pinia';
    import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const workflowsStore = useWorkflowsStore();
    const {initializeStore, handleListWorkflows, setFilters} = workflowsStore;
    const {workflows, isLoading, hasMore} = storeToRefs(workflowsStore);

    const route = useRoute();
    const router = useRouter();

    const {savedViews, currentView, updateColumns, updateFilters, saveView, deleteView, changeView} = useTableViews();

    // Restore filters from URL query params on setup
    const initialFilters: typeof currentView.value.filters = [];
    for (const columnId of filterableColumnIds) {
        const param = route.query[columnId];
        if (typeof param === 'string' && param.length > 0) {
            initialFilters.push({column: columnId, values: param.split(',')});
        }
    }
    const initialApiFilters: WorkflowFilters = {};
    if (initialFilters.length > 0) {
        updateFilters(initialFilters);
        for (const f of initialFilters) {
            (initialApiFilters as Record<string, string[]>)[f.column] = f.values;
        }
    }

    const selectedJob = ref<WorkflowJob | null>(null);
    const expandedRuns = ref<Set<number>>(new Set());
    const dateRange = ref<DateRange>({});

    onMounted(async () => {
        await initializeStore(Object.keys(initialApiFilters).length > 0 ? initialApiFilters : undefined);
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
            default:
                return '';
        }
    }

    function getActiveFilterValues(columnId: string): string[] {
        const filter = currentView.value.filters.find((f) => f.column === columnId);
        return filter?.values ?? [];
    }

    function handleColumnFilterChange(columnId: string, values: string[]) {
        const filters = currentView.value.filters;
        if (values.length === 0) {
            updateFilters(filters.filter((f) => f.column !== columnId));
        } else {
            const otherFilters = filters.filter((f) => f.column !== columnId);
            updateFilters([...otherFilters, {column: columnId, values}]);
        }
    }

    function buildApiFilters(): {apiFilters: WorkflowFilters; query: Record<string, string>} {
        const apiFilters: WorkflowFilters = {};
        const query: Record<string, string> = {};

        for (const f of currentView.value.filters) {
            (apiFilters as Record<string, string[]>)[f.column] = f.values;
            query[f.column] = f.values.join(',');
        }

        if (dateRange.value.window) {
            apiFilters.window = dateRange.value.window as WorkflowFilters['window'];
        } else {
            if (dateRange.value.from) apiFilters.created_from = dateRange.value.from.toISOString();
            if (dateRange.value.to) apiFilters.created_to = dateRange.value.to.toISOString();
        }

        return {apiFilters, query};
    }

    watch(
        () => currentView.value.filters,
        () => {
            const {apiFilters, query} = buildApiFilters();
            const newQuery = {...route.query};
            for (const col of filterableColumnIds) {
                delete newQuery[col];
            }
            Object.assign(newQuery, query);
            router.replace({query: newQuery});
            setFilters(apiFilters);
        },
        {deep: true},
    );

    watch(
        dateRange,
        () => {
            const {apiFilters} = buildApiFilters();
            setFilters(apiFilters);
        },
        {deep: true},
    );

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
    <div class="flex flex-col gap-4 h-full min-h-0 min-w-0">
        <!-- Description + Date Range -->
        <div class="flex items-center justify-between gap-4 shrink-0">
            <p class="text-muted-foreground">Complete workflow history with infinite scrolling</p>
            <DateTimeRangePicker v-model:date-range="dateRange" />
        </div>

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
