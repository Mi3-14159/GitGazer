<script setup lang="ts">
    import DateTimeRangePicker, {type DateRange} from '@/components/DateTimeRangePicker.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import {useAuth} from '@/composables/useAuth';
    import type {OverviewResponse, WorkflowRunWithRelations} from '@common/types';
    import {formatDistanceToNow} from 'date-fns';
    import {Activity, Ban, CheckCircle2, Clock, XCircle} from 'lucide-vue-next';
    import {computed, onMounted, ref, watch} from 'vue';

    const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

    const {fetchWithAuth} = useAuth();
    const overview = ref<OverviewResponse | null>(null);
    const isLoading = ref(true);
    const dateRange = ref<DateRange>({});

    async function fetchOverview() {
        isLoading.value = true;
        try {
            const params = new URLSearchParams();
            if (dateRange.value.window) {
                params.set('window', dateRange.value.window);
            } else {
                if (dateRange.value.from) params.set('created_from', dateRange.value.from.toISOString());
                if (dateRange.value.to) params.set('created_to', dateRange.value.to.toISOString());
            }
            const response = await fetchWithAuth(`${API_ENDPOINT}/overview?${params.toString()}`);
            if (response.ok) {
                overview.value = (await response.json()) as OverviewResponse;
            }
        } catch {
            // Silently handle errors
        } finally {
            isLoading.value = false;
        }
    }

    onMounted(() => fetchOverview());

    watch(dateRange, () => fetchOverview(), {deep: true});

    const stats = computed(() => overview.value?.stats ?? {total: 0, success: 0, failure: 0, inProgress: 0, other: 0});
    const successRate = computed(() => (stats.value.total > 0 ? ((stats.value.success / stats.value.total) * 100).toFixed(1) : '0.0'));
    const recentWorkflows = computed(() => overview.value?.recentWorkflows ?? []);

    const statusConfig: Record<string, {icon: any; color: string; label: string}> = {
        success: {icon: CheckCircle2, color: 'bg-green-500/10 text-green-600 border-green-500/20', label: 'Success'},
        failure: {icon: XCircle, color: 'bg-red-500/10 text-red-600 border-red-500/20', label: 'Failed'},
        in_progress: {icon: Clock, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', label: 'In Progress'},
        queued: {icon: Clock, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', label: 'Queued'},
        cancelled: {icon: Ban, color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', label: 'Cancelled'},
    };

    function getStatusConfig(w: WorkflowRunWithRelations) {
        if (w.status === 'in_progress') return statusConfig.in_progress;
        if (w.status === 'queued') return statusConfig.queued;
        return statusConfig[w.conclusion ?? 'success'] ?? statusConfig.success;
    }

    function workflowDuration(w: WorkflowRunWithRelations) {
        if (!w.runStartedAt || !w.updatedAt) return 'Pending';
        const start = new Date(w.runStartedAt).getTime();
        const end = new Date(w.updatedAt).getTime();
        const seconds = Math.floor((end - start) / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    }

    // Pie chart using CSS conic-gradient
    const pieGradient = computed(() => {
        const total = stats.value.total || 1;
        const s = (stats.value.success / total) * 100;
        const f = (stats.value.failure / total) * 100;
        const p = (stats.value.inProgress / total) * 100;
        const sEnd = s;
        const fEnd = sEnd + f;
        const pEnd = fEnd + p;
        return `conic-gradient(#22c55e 0% ${sEnd}%, #ef4444 ${sEnd}% ${fEnd}%, #3b82f6 ${fEnd}% ${pEnd}%, #94a3b8 ${pEnd}% 100%)`;
    });
</script>

<template>
    <div class="space-y-6 p-4 md:p-6">
        <div class="flex items-center justify-between gap-4">
            <p class="text-muted-foreground">Real-time CI/CD pipeline monitoring and engineering metrics</p>
            <DateTimeRangePicker v-model:date-range="dateRange" />
        </div>

        <!-- Stat cards -->
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle class="text-sm font-medium">Total Workflows</CardTitle>
                    <Activity class="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div class="text-2xl font-bold">{{ stats.total }}</div>
                    <p class="text-xs text-muted-foreground">Active pipelines</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle class="text-sm font-medium">Successful Runs</CardTitle>
                    <CheckCircle2 class="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div class="text-2xl font-bold">{{ stats.success }}</div>
                    <p class="text-xs text-muted-foreground">{{ successRate }}% success rate</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle class="text-sm font-medium">Failed Runs</CardTitle>
                    <XCircle class="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                    <div class="text-2xl font-bold">{{ stats.failure }}</div>
                    <p class="text-xs text-muted-foreground">Requires attention</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle class="text-sm font-medium">In Progress</CardTitle>
                    <Clock class="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                    <div class="text-2xl font-bold">{{ stats.inProgress }}</div>
                    <p class="text-xs text-muted-foreground">Currently running</p>
                </CardContent>
            </Card>
        </div>

        <!-- Workflow Status Distribution -->
        <Card>
            <CardHeader>
                <CardTitle>Workflow Status Distribution</CardTitle>
                <CardDescription>Overview of all workflow statuses</CardDescription>
            </CardHeader>
            <CardContent class="flex justify-center">
                <div class="relative">
                    <div
                        class="w-48 h-48 rounded-full"
                        :style="{background: pieGradient}"
                    />
                    <div class="mt-4 flex flex-wrap gap-3 justify-center text-xs">
                        <span class="flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-green-500" />
                            Success {{ stats.success }}
                        </span>
                        <span class="flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-red-500" />
                            Failed {{ stats.failure }}
                        </span>
                        <span class="flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-blue-500" />
                            In Progress {{ stats.inProgress }}
                        </span>
                        <span class="flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-gray-400" />
                            Other {{ stats.other }}
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- Recent Workflow Runs -->
        <Card>
            <CardHeader>
                <CardTitle>Recent Workflow Runs</CardTitle>
                <CardDescription>Latest CI/CD pipeline executions</CardDescription>
            </CardHeader>
            <CardContent>
                <div
                    v-if="isLoading"
                    class="text-sm text-muted-foreground text-center py-8"
                >
                    Loading workflows...
                </div>
                <div
                    v-else-if="recentWorkflows.length === 0"
                    class="text-sm text-muted-foreground text-center py-8"
                >
                    No recent workflow runs.
                </div>
                <div
                    v-else
                    class="grid gap-4 md:grid-cols-2"
                >
                    <Card
                        v-for="w in recentWorkflows"
                        :key="w.id"
                        class="hover:shadow-md transition-shadow"
                    >
                        <CardHeader class="pb-3">
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <CardTitle class="text-base mb-1">{{ w.name }}</CardTitle>
                                    <div class="text-sm text-muted-foreground">{{ w.repository?.name ?? 'unknown' }} &bull; {{ w.headBranch }}</div>
                                </div>
                                <Badge
                                    variant="outline"
                                    :class="getStatusConfig(w).color"
                                >
                                    <component
                                        :is="getStatusConfig(w).icon"
                                        class="mr-1 h-3 w-3"
                                    />
                                    {{ getStatusConfig(w).label }}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div class="space-y-2">
                                <div class="flex items-center gap-2 text-sm">
                                    <span class="text-muted-foreground truncate">{{ w.headCommitMessage }}</span>
                                </div>
                                <div class="flex items-center justify-between text-sm text-muted-foreground">
                                    <span>{{ w.headCommitAuthorName }}</span>
                                    <span>{{ workflowDuration(w) }}</span>
                                </div>
                                <div class="text-xs text-muted-foreground">
                                    {{ w.createdAt ? formatDistanceToNow(new Date(w.createdAt), {addSuffix: true}) : '' }}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </CardContent>
        </Card>
    </div>
</template>
