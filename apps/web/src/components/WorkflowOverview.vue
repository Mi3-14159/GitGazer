<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import WorkflowCardDetails from '@/components/WorkflowCardDetails.vue';
    import {useWorkflowsStore} from '@/stores/workflows';
    import {WorkflowJob} from '@common/types';
    import {Activity, CheckCircle2, ChevronDown, ChevronRight, Clock, GitBranch, XCircle} from 'lucide-vue-next';
    import {storeToRefs} from 'pinia';
    import {computed, onMounted, ref} from 'vue';

    const workflowsStore = useWorkflowsStore();
    const {initializeStore, handleListWorkflows} = workflowsStore;
    const {workflows, isLoading, hasMore} = storeToRefs(workflowsStore);
    const selectedJob = ref<WorkflowJob | null>(null);
    const expandedRuns = ref<Set<number>>(new Set());
    const scrollContainer = ref<HTMLElement | null>(null);

    onMounted(async () => {
        await initializeStore();
    });

    const runs = computed(() => workflows.value.filter((run) => run.workflowJobs?.length > 0));

    const successCount = computed(() => runs.value.filter((r) => r.conclusion === 'success').length);
    const failureCount = computed(() => runs.value.filter((r) => r.conclusion === 'failure').length);
    const inProgressCount = computed(() => runs.value.filter((r) => r.status === 'in_progress' || r.status === 'queued').length);

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
            default:
                return Clock;
        }
    }

    function handleScroll(e: Event) {
        const el = e.target as HTMLElement;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
            if (!isLoading.value && hasMore.value) {
                handleListWorkflows();
            }
        }
    }
</script>

<template>
    <div class="space-y-6">
        <!-- Stats cards -->
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle class="text-sm font-medium">Total Workflows</CardTitle>
                    <Activity class="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div class="text-2xl font-bold">{{ runs.length }}</div>
                    <p class="text-xs text-muted-foreground">Active pipelines</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle class="text-sm font-medium">Successful</CardTitle>
                    <CheckCircle2 class="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div class="text-2xl font-bold">{{ successCount }}</div>
                    <p class="text-xs text-muted-foreground">
                        {{ runs.length > 0 ? ((successCount / runs.length) * 100).toFixed(1) : 0 }}% success rate
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle class="text-sm font-medium">Failed</CardTitle>
                    <XCircle class="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                    <div class="text-2xl font-bold">{{ failureCount }}</div>
                    <p class="text-xs text-muted-foreground">Requires attention</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle class="text-sm font-medium">In Progress</CardTitle>
                    <Clock class="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                    <div class="text-2xl font-bold">{{ inProgressCount }}</div>
                    <p class="text-xs text-muted-foreground">Currently running</p>
                </CardContent>
            </Card>
        </div>

        <!-- Workflow Runs Table -->
        <Card>
            <CardHeader>
                <CardTitle>Workflow Runs</CardTitle>
                <CardDescription>Latest CI/CD pipeline executions</CardDescription>
            </CardHeader>
            <CardContent>
                <!-- Loading skeleton -->
                <div
                    v-if="isLoading && runs.length === 0"
                    class="space-y-3"
                >
                    <Skeleton
                        v-for="i in 5"
                        :key="i"
                        class="h-12 w-full"
                    />
                </div>

                <div
                    v-else
                    ref="scrollContainer"
                    class="border rounded-lg overflow-auto max-h-[600px]"
                    @scroll="handleScroll"
                >
                    <table class="w-full text-sm">
                        <thead class="bg-muted/50 border-b sticky top-0 z-10">
                            <tr>
                                <th class="text-left py-2 px-3 font-medium w-8"></th>
                                <th class="text-left py-2 px-3 font-medium">Repository</th>
                                <th class="text-left py-2 px-3 font-medium">Workflow</th>
                                <th class="text-left py-2 px-3 font-medium">Branch</th>
                                <th class="text-left py-2 px-3 font-medium">Status</th>
                                <th class="text-left py-2 px-3 font-medium">Created</th>
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
                                    <td class="py-2 px-3 font-mono text-xs">{{ run.repository?.name }}</td>
                                    <td class="py-2 px-3">
                                        <div class="font-medium">{{ run.name }}</div>
                                    </td>
                                    <td class="py-2 px-3">
                                        <div class="flex items-center gap-1 text-xs">
                                            <GitBranch class="h-3 w-3 text-muted-foreground" />
                                            {{ run.headBranch }}
                                        </div>
                                    </td>
                                    <td class="py-2 px-3">
                                        <Badge
                                            :variant="statusBadgeVariant(run.conclusion || run.status || '')"
                                            class="gap-1 text-xs"
                                        >
                                            <component
                                                :is="statusIcon(run.conclusion || run.status || '')"
                                                class="h-3 w-3"
                                            />
                                            {{ run.conclusion || run.status || 'unknown' }}
                                        </Badge>
                                    </td>
                                    <td class="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
                                        {{ run.createdAt ? new Date(run.createdAt).toLocaleString() : '' }}
                                    </td>
                                </tr>
                                <!-- Expanded job rows -->
                                <template v-if="expandedRuns.has(run.id)">
                                    <tr
                                        v-for="job in run.workflowJobs"
                                        :key="job.id"
                                        class="border-b bg-muted/10 hover:bg-muted/20 transition-colors text-xs cursor-pointer"
                                        @click.stop="onJobClick(job)"
                                    >
                                        <td class="py-1.5 px-3"></td>
                                        <td class="py-1.5 px-3"></td>
                                        <td class="py-1.5 px-3 pl-6 font-medium">{{ job.name }}</td>
                                        <td class="py-1.5 px-3"></td>
                                        <td class="py-1.5 px-3">
                                            <Badge
                                                :variant="statusBadgeVariant(job.conclusion || job.status || '')"
                                                class="gap-1 text-xs"
                                            >
                                                <component
                                                    :is="statusIcon(job.conclusion || job.status || '')"
                                                    class="h-3 w-3"
                                                />
                                                {{ job.conclusion || job.status || 'unknown' }}
                                            </Badge>
                                        </td>
                                        <td class="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                                            {{ job.createdAt ? new Date(job.createdAt).toLocaleString() : '' }}
                                        </td>
                                    </tr>
                                </template>
                            </template>
                        </tbody>
                    </table>

                    <!-- Loading more -->
                    <div
                        v-if="isLoading"
                        class="h-8 flex items-center justify-center"
                    >
                        <span class="text-xs text-muted-foreground">Loading more workflows...</span>
                    </div>
                    <div
                        v-if="!hasMore && runs.length > 0"
                        class="h-8 flex items-center justify-center"
                    >
                        <span class="text-xs text-muted-foreground">{{ runs.length }} workflows loaded</span>
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- Job details dialog -->
        <WorkflowCardDetails
            v-if="selectedJob"
            :job="selectedJob"
            :run="getRunOfSelectedJob()"
            @update:job="selectedJob = $event"
        />
    </div>
</template>
