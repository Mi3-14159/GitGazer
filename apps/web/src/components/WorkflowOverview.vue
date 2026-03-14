<script setup lang="ts">
    import ColumnHeaderFilter from '@/components/ColumnHeaderFilter.vue';
    import ColumnSelector from '@/components/ColumnSelector.vue';
    import DateTimeRangePicker, {type DateTimeRange} from '@/components/DateTimeRangePicker.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import ViewManager from '@/components/ViewManager.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useTableViews} from '@/composables/useTableViews';
    import {useWorkflowsStore} from '@/stores/workflows';
    import {filterableColumnIds} from '@/types/table';
    import type {WorkflowJob, WorkflowRunWithRelations} from '@common/types';
    import {formatDistanceToNow} from 'date-fns';
    import {AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, GitBranch, GitCommit, Server, User, XCircle} from 'lucide-vue-next';
    import {storeToRefs} from 'pinia';
    import {computed, onMounted, onUnmounted, ref} from 'vue';

    const workflowsStore = useWorkflowsStore();
    const {initializeStore, handleListWorkflows} = workflowsStore;
    const {workflows, isLoading, hasMore} = storeToRefs(workflowsStore);

    const {savedViews, currentView, updateColumns, updateFilters, saveView, deleteView, changeView} = useTableViews();

    const selectedJob = ref<WorkflowJob | null>(null);
    const expandedRuns = ref<Set<number>>(new Set());
    const dateRange = ref<DateTimeRange>({from: undefined, to: undefined});

    onMounted(async () => {
        await initializeStore();
        window.addEventListener('scroll', handleScroll);
    });

    onUnmounted(() => {
        window.removeEventListener('scroll', handleScroll);
    });

    const allRuns = computed(() => workflows.value.filter((run) => run.workflowJobs?.length > 0));

    // Apply date range filter
    const dateFilteredRuns = computed(() => {
        if (!dateRange.value.from) return allRuns.value;
        return allRuns.value.filter((run) => {
            const created = new Date(run.createdAt);
            if (dateRange.value.from && created < dateRange.value.from) return false;
            if (dateRange.value.to && created > dateRange.value.to) return false;
            return true;
        });
    });

    // Apply column filters
    const runs = computed(() => {
        const filters = currentView.value.filters;
        if (filters.length === 0) return dateFilteredRuns.value;
        return dateFilteredRuns.value.filter((run) => {
            return filters.every((filter) => {
                const value = getColumnValue(run, filter.column);
                return filter.values.includes(value);
            });
        });
    });

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
    <div class="flex flex-col gap-4 h-full min-h-0">
        <!-- Description + Date Range -->
        <div class="flex items-center justify-between gap-4 shrink-0">
            <p class="text-muted-foreground">Complete workflow history with infinite scrolling</p>
            <DateTimeRangePicker v-model="dateRange" />
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
            class="border rounded-lg overflow-visible"
        >
            <table class="w-full text-sm">
                <thead class="bg-muted/50 border-b sticky top-0 z-10">
                    <tr>
                        <th class="text-left py-2 px-3 font-medium w-8"></th>
                        <th
                            v-for="column in visibleColumns"
                            :key="column.id"
                            class="text-left py-2 px-3 font-medium"
                        >
                            <div class="flex items-center gap-1">
                                <span>{{ column.label }}</span>
                                <ColumnHeaderFilter
                                    v-if="filterableColumnIds.includes(column.id)"
                                    :column-id="column.id"
                                    :column-label="column.label"
                                    :workflows="dateFilteredRuns"
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
                                class="py-2 px-3"
                            >
                                <!-- Workflow -->
                                <template v-if="column.id === 'workflow'">
                                    <div>
                                        <div class="font-medium truncate max-w-[200px]">{{ run.name }}</div>
                                        <div class="text-xs text-muted-foreground">#{{ run.runAttempt }}</div>
                                    </div>
                                </template>
                                <!-- Repository -->
                                <template v-else-if="column.id === 'repository'">
                                    <div class="font-mono text-xs truncate max-w-[180px]">{{ run.repository?.name }}</div>
                                </template>
                                <!-- Branch -->
                                <template v-else-if="column.id === 'branch'">
                                    <div class="flex items-center gap-1 text-xs">
                                        <GitBranch class="h-3 w-3 text-muted-foreground" />
                                        <span class="truncate max-w-[120px]">{{ run.headBranch }}</span>
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
                                        <span class="truncate max-w-[100px]">{{ run.headCommitAuthorName }}</span>
                                    </div>
                                </template>
                                <!-- Duration -->
                                <template v-else-if="column.id === 'duration'">
                                    <div class="text-xs font-mono">{{ formatDuration(run.runStartedAt, run.updatedAt) }}</div>
                                </template>
                                <!-- Started -->
                                <template v-else-if="column.id === 'started'">
                                    <div class="text-xs text-muted-foreground whitespace-nowrap">
                                        {{ run.runStartedAt ? formatDistanceToNow(new Date(run.runStartedAt), {addSuffix: true}) : '' }}
                                    </div>
                                </template>
                                <!-- Commit -->
                                <template v-else-if="column.id === 'commit'">
                                    <div class="flex items-center gap-1 text-xs font-mono">
                                        <GitCommit class="h-3 w-3 text-muted-foreground" />
                                        <span class="truncate max-w-[200px]">{{ run.headCommitMessage }}</span>
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
