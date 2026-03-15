<script setup lang="ts">
    import ColumnHeaderFilter from '@/components/ColumnHeaderFilter.vue';
    import ColumnSelector from '@/components/ColumnSelector.vue';
    import DateTimeRangePicker, {type DateRange} from '@/components/DateTimeRangePicker.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import ViewManager from '@/components/ViewManager.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useTableViews} from '@/composables/useTableViews';
    import {useWorkflowsStore} from '@/stores/workflows';
    import {filterableColumnIds} from '@/types/table';
    import type {WorkflowFilters, WorkflowJob, WorkflowRunWithRelations} from '@common/types';
    import {formatDistanceToNow} from 'date-fns';
    import {AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, GitBranch, GitCommit, Server, User, XCircle} from 'lucide-vue-next';
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
    // Build initial API filters from URL (includes date range)
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

    // All filtering is server-side
    const runs = computed(() => allRuns.value);

    const visibleColumns = computed(() => currentView.value.columns.filter((c) => c.visible));

    const columnWidthClass: Record<string, string> = {
        workflow: 'w-[17%]',
        repository: 'w-[15%]',
        branch: 'w-[11%]',
        status: 'w-[11%]',
        jobs: 'w-[7%]',
        actor: 'w-[13%]',
        duration: 'w-[8%]',
        created: 'w-[10%]',
        started: 'w-[10%]',
        commit: 'w-[16%]',
        run_number: 'w-[7%]',
    };

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

        // Column filters
        for (const f of currentView.value.filters) {
            (apiFilters as Record<string, string[]>)[f.column] = f.values;
            query[f.column] = f.values.join(',');
        }

        // Date range filter (URL is managed by DateTimeRangePicker)
        if (dateRange.value.window) {
            apiFilters.window = dateRange.value.window as WorkflowFilters['window'];
        } else {
            if (dateRange.value.from) apiFilters.created_from = dateRange.value.from.toISOString();
            if (dateRange.value.to) apiFilters.created_to = dateRange.value.to.toISOString();
        }

        return {apiFilters, query};
    }

    // Column filter changes → sync to URL + refetch
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

    // Date range changes → refetch only (URL managed by DateTimeRangePicker)
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

    function statusBadgeVariant(status: string): 'success' | 'destructive' | 'warning' | 'default' | 'secondary' {
        switch (status) {
            case 'success':
                return 'success';
            case 'failure':
            case 'failed':
                return 'destructive';
            case 'cancelled':
                return 'warning';
            default:
                return 'secondary';
        }
    }

    function statusIcon(status: string) {
        switch (status) {
            case 'success':
                return CheckCircle2;
            case 'failure':
            case 'failed':
                return XCircle;
            case 'cancelled':
                return AlertCircle;
            default:
                return Clock;
        }
    }

    function formatDuration(startedAt: string | Date | null, completedAt: string | Date | null): string {
        if (!startedAt) return '-';
        const start = new Date(startedAt);
        const end = completedAt ? new Date(completedAt) : new Date();
        const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
        if (seconds < 0) return '-';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
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

        <!-- Toolbar: ViewManager + ColumnSelector -->
        <div class="flex items-center justify-between shrink-0">
            <ViewManager
                :current-view="currentView"
                :saved-views="savedViews"
                @view-change="changeView"
                @save-view="saveView"
                @delete-view="deleteView"
            />
            <ColumnSelector
                :columns="currentView.columns"
                @update:columns="updateColumns"
            />
        </div>

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
        <div
            v-else
            class="border rounded-lg overflow-x-auto min-w-0"
        >
            <table class="w-full table-fixed text-sm">
                <thead class="bg-muted/50 border-b sticky top-0 z-10">
                    <tr>
                        <th class="text-left py-2 px-3 font-medium w-8"></th>
                        <th
                            v-for="column in visibleColumns"
                            :key="column.id"
                            :class="['text-left py-2 px-3 font-medium', columnWidthClass[column.id]]"
                        >
                            <div class="flex items-center gap-1">
                                <span>{{ column.label }}</span>
                                <ColumnHeaderFilter
                                    v-if="filterableColumnIds.includes(column.id)"
                                    :column-id="column.id"
                                    :column-label="column.label"
                                    :workflows="runs"
                                    :active-values="getActiveFilterValues(column.id)"
                                    :get-column-value="getColumnValue"
                                    @filter-change="handleColumnFilterChange(column.id, $event)"
                                />
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <template
                        v-for="run in runs"
                        :key="run.id"
                    >
                        <tr
                            class="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                            @click="toggleRun(run.id)"
                        >
                            <td class="py-2 px-3">
                                <component
                                    :is="expandedRuns.has(run.id) ? ChevronDown : ChevronRight"
                                    class="h-4 w-4 text-muted-foreground"
                                />
                            </td>
                            <td
                                v-for="column in visibleColumns"
                                :key="column.id"
                                class="py-2 px-3 truncate"
                            >
                                <!-- Workflow -->
                                <template v-if="column.id === 'workflow'">
                                    <div>
                                        <div class="font-medium truncate">{{ run.name }}</div>
                                        <div class="text-xs text-muted-foreground">#{{ run.runAttempt }}</div>
                                    </div>
                                </template>
                                <!-- Repository -->
                                <template v-else-if="column.id === 'repository'">
                                    <div class="font-mono text-xs truncate">{{ run.repository?.name }}</div>
                                </template>
                                <!-- Branch -->
                                <template v-else-if="column.id === 'branch'">
                                    <div class="flex items-center gap-1 text-xs">
                                        <GitBranch class="h-3 w-3 text-muted-foreground" />
                                        <span class="truncate">{{ run.headBranch }}</span>
                                    </div>
                                </template>
                                <!-- Status -->
                                <template v-else-if="column.id === 'status'">
                                    <Badge
                                        :variant="statusBadgeVariant(run.conclusion || run.status || '')"
                                        class="gap-1 h-5 text-xs px-1.5"
                                    >
                                        <component
                                            :is="statusIcon(run.conclusion || run.status || '')"
                                            class="h-3.5 w-3.5"
                                        />
                                        {{ run.conclusion || run.status || 'unknown' }}
                                    </Badge>
                                </template>
                                <!-- Jobs -->
                                <template v-else-if="column.id === 'jobs'">
                                    <div class="flex items-center gap-1">
                                        <span class="text-xs font-medium">{{ run.workflowJobs.length }}</span>
                                        <span class="text-xs text-muted-foreground">
                                            ({{ run.workflowJobs.filter((j) => j.conclusion === 'success').length }} ✓)
                                        </span>
                                    </div>
                                </template>
                                <!-- Actor -->
                                <template v-else-if="column.id === 'actor'">
                                    <div class="flex items-center gap-1 text-xs">
                                        <User class="h-3 w-3 text-muted-foreground" />
                                        <span class="truncate">{{ run.headCommitAuthorName }}</span>
                                    </div>
                                </template>
                                <!-- Duration -->
                                <template v-else-if="column.id === 'duration'">
                                    <div class="text-xs font-mono">{{ formatDuration(run.runStartedAt, run.updatedAt) }}</div>
                                </template>
                                <!-- Created -->
                                <template v-else-if="column.id === 'created'">
                                    <div class="text-xs text-muted-foreground truncate">
                                        {{ run.createdAt ? formatDistanceToNow(new Date(run.createdAt), {addSuffix: true}) : '' }}
                                    </div>
                                </template>
                                <!-- Started -->
                                <template v-else-if="column.id === 'started'">
                                    <div class="text-xs text-muted-foreground truncate">
                                        {{ run.runStartedAt ? formatDistanceToNow(new Date(run.runStartedAt), {addSuffix: true}) : '' }}
                                    </div>
                                </template>
                                <!-- Commit -->
                                <template v-else-if="column.id === 'commit'">
                                    <div class="flex items-center gap-1 text-xs font-mono">
                                        <GitCommit class="h-3 w-3 text-muted-foreground" />
                                        <span class="truncate">{{ run.headCommitMessage }}</span>
                                    </div>
                                </template>
                                <!-- Run Number -->
                                <template v-else-if="column.id === 'run_number'">
                                    <div class="text-xs font-mono">#{{ run.runAttempt }}</div>
                                </template>
                            </td>
                        </tr>
                        <!-- Expanded job rows -->
                        <template v-if="expandedRuns.has(run.id)">
                            <tr
                                v-for="job in run.workflowJobs"
                                :key="job.id"
                                class="border-b bg-muted/20 hover:bg-muted/30 transition-colors text-xs cursor-pointer"
                                @click.stop="onJobClick(job)"
                            >
                                <td class="py-1.5 px-3"></td>
                                <td
                                    v-for="column in visibleColumns"
                                    :key="column.id"
                                    class="py-1.5 px-3"
                                >
                                    <template v-if="column.id === 'workflow'">
                                        <div class="flex items-center gap-1.5 pl-4">
                                            <Server class="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                            <span class="font-medium">{{ job.name }}</span>
                                        </div>
                                    </template>
                                    <template v-else-if="column.id === 'repository'">
                                        <span class="font-mono text-muted-foreground">{{ job.runnerGroupName }}</span>
                                    </template>
                                    <template v-else-if="column.id === 'status'">
                                        <Badge
                                            :variant="statusBadgeVariant(job.conclusion || job.status || '')"
                                            class="gap-1 h-5 text-xs px-1.5"
                                        >
                                            <component
                                                :is="statusIcon(job.conclusion || job.status || '')"
                                                class="h-3.5 w-3.5"
                                            />
                                            {{ job.conclusion || job.status || 'unknown' }}
                                        </Badge>
                                    </template>
                                    <template v-else-if="column.id === 'duration'">
                                        <span class="font-mono">{{ formatDuration(job.startedAt, job.completedAt) }}</span>
                                    </template>
                                    <template v-else-if="column.id === 'created'">
                                        <span class="text-muted-foreground whitespace-nowrap">
                                            {{ job.createdAt ? formatDistanceToNow(new Date(job.createdAt), {addSuffix: true}) : '' }}
                                        </span>
                                    </template>
                                    <template v-else-if="column.id === 'started'">
                                        <span class="text-muted-foreground whitespace-nowrap">
                                            {{ job.startedAt ? formatDistanceToNow(new Date(job.startedAt), {addSuffix: true}) : '' }}
                                        </span>
                                    </template>
                                </td>
                            </tr>
                        </template>
                    </template>
                </tbody>
            </table>

            <!-- Infinite scroll status -->
            <div class="h-8 flex items-center justify-center">
                <span
                    v-if="isLoading"
                    class="text-xs text-muted-foreground"
                    >Loading more workflows...</span
                >
                <span
                    v-else-if="!hasMore && runs.length > 0"
                    class="text-xs text-muted-foreground"
                >
                    {{ runs.length }} of {{ allRuns.length }} workflows loaded
                </span>
                <span
                    v-else-if="runs.length === 0 && !isLoading"
                    class="text-xs text-muted-foreground py-8"
                >
                    No workflows match the current filters
                </span>
            </div>
        </div>

        <!-- Job details dialog -->
        <WorkflowCardDetails
            v-if="selectedJob"
            :job="selectedJob"
            :run="getRunOfSelectedJob()"
            @update:job="selectedJob = $event"
        />
    </div>
</template>
