<script setup lang="ts">
    import CustomMetricsDashboard from '@/components/CustomMetricsDashboard.vue';
    import DashboardSidebar from '@/components/DashboardSidebar.vue';
    import EChart from '@/components/charts/EChart.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import {useChartTheme} from '@/composables/useChartTheme';
    import {useIntegration} from '@/composables/useIntegration';
    import {useMetrics} from '@/composables/useMetrics';
    import {useDashboardsStore} from '@/stores/dashboards';
    import type {Granularity, MetricsFilter} from '@common/types/metrics';
    import {AlertCircle, BarChart3, Clock, Info, Lock, Minus, Rocket, Smile, TrendingDown, TrendingUp, Users, Wrench, Zap} from 'lucide-vue-next';
    import {computed, onMounted, ref, watch} from 'vue';
    import {useRoute} from 'vue-router';

    const route = useRoute();
    const store = useDashboardsStore();
    const {getIntegrations} = useIntegration();
    const {doraMetrics, spaceMetrics, isLoadingDora, isLoadingSpace, fetchDoraMetrics, fetchSpaceMetrics, fetchRepositories} = useMetrics();
    const chart = useChartTheme();

    const dashboardId = computed(() => route.params.id as string);
    const dashboard = computed(() => store.getDashboard(dashboardId.value));
    const isSystem = computed(() => dashboardId.value.startsWith('system-'));
    const isDora = computed(() => dashboardId.value === 'system-dora');
    const isSpace = computed(() => dashboardId.value === 'system-space');

    const integrations = ref<{integrationId: string; label: string}[]>([]);
    const selectedIntegration = ref('');
    const repositories = ref<{id: number; name: string}[]>([]);
    const filter = ref<MetricsFilter>({granularity: 'week'});

    onMounted(async () => {
        const data = await getIntegrations();
        if (data) {
            integrations.value = data.map((i) => ({integrationId: i.integrationId, label: i.label}));
            if (integrations.value.length > 0) {
                selectedIntegration.value = integrations.value[0].integrationId;
            }
        }
    });

    watch(
        [selectedIntegration, filter, dashboardId],
        async () => {
            if (!selectedIntegration.value || !isSystem.value) return;
            if (isDora.value) {
                await fetchDoraMetrics(selectedIntegration.value, filter.value);
            }
            if (isSpace.value) {
                await fetchSpaceMetrics(selectedIntegration.value, filter.value);
            }
            repositories.value = await fetchRepositories(selectedIntegration.value);
        },
        {immediate: true},
    );

    const granularityOptions: {value: Granularity; label: string}[] = [
        {value: 'day', label: 'Daily'},
        {value: 'week', label: 'Weekly'},
        {value: 'month', label: 'Monthly'},
    ];

    function trendIcon(trend: string) {
        if (trend === 'up') return TrendingUp;
        if (trend === 'down') return TrendingDown;
        return Minus;
    }

    function trendColor(trend: string, invert = false) {
        const isGood = invert ? trend === 'down' : trend === 'up';
        if (isGood) return 'text-green-500';
        if (trend === 'stable') return 'text-muted-foreground';
        return 'text-red-500';
    }

    // DORA chart options
    const deployFreqChart = computed(() => {
        if (!doraMetrics.value) return null;
        return chart.buildBarChart({
            title: 'Deployment Frequency',
            data: doraMetrics.value.deploymentFrequency.data,
            unit: doraMetrics.value.deploymentFrequency.unit,
            granularity: filter.value.granularity ?? 'week',
            color: undefined,
        });
    });

    const leadTimeChart = computed(() => {
        if (!doraMetrics.value) return null;
        return chart.buildLineChart({
            title: 'Lead Time for Changes',
            data: doraMetrics.value.leadTimeForChanges.data,
            unit: doraMetrics.value.leadTimeForChanges.unit,
            granularity: filter.value.granularity ?? 'week',
            areaStyle: true,
        });
    });

    const changeFailureChart = computed(() => {
        if (!doraMetrics.value) return null;
        return chart.buildLineChart({
            title: 'Change Failure Rate',
            data: doraMetrics.value.changeFailureRate.data,
            unit: doraMetrics.value.changeFailureRate.unit,
            granularity: filter.value.granularity ?? 'week',
            color: undefined,
            markLines: [{value: 15, label: 'Target', color: '#EF5350'}],
        });
    });

    const mttrChart = computed(() => {
        if (!doraMetrics.value) return null;
        return chart.buildLineChart({
            title: 'Mean Time to Recovery',
            data: doraMetrics.value.meanTimeToRecovery.data,
            unit: doraMetrics.value.meanTimeToRecovery.unit,
            granularity: filter.value.granularity ?? 'week',
            areaStyle: true,
        });
    });

    // SPACE chart options
    const mergeRateGauge = computed(() => {
        if (!spaceMetrics.value) return null;
        return chart.buildGaugeChart({
            value: spaceMetrics.value.prMergeRate.summary.current,
            title: 'PR Merge Rate',
        });
    });

    const activityChart = computed(() => {
        if (!spaceMetrics.value) return null;
        return chart.buildBarChart({
            title: 'Activity Volume',
            data: spaceMetrics.value.activityVolume.data,
            unit: spaceMetrics.value.activityVolume.unit,
            granularity: filter.value.granularity ?? 'week',
        });
    });

    const contributorChart = computed(() => {
        if (!spaceMetrics.value) return null;
        return chart.buildLineChart({
            title: 'Active Contributors',
            data: spaceMetrics.value.contributorCount.data,
            unit: spaceMetrics.value.contributorCount.unit,
            granularity: filter.value.granularity ?? 'week',
            areaStyle: true,
        });
    });

    const efficiencyChart = computed(() => {
        if (!spaceMetrics.value) return null;
        const g = filter.value.granularity ?? 'week';
        return chart.buildMultiLineChart({
            series: [
                {name: 'CI Duration', data: spaceMetrics.value.ciDuration.data, color: '#42A5F5', unit: spaceMetrics.value.ciDuration.unit},
                {name: 'PR Cycle Time', data: spaceMetrics.value.prCycleTime.data, color: '#66BB6A', unit: spaceMetrics.value.prCycleTime.unit},
                {
                    name: 'Queue Time',
                    data: spaceMetrics.value.workflowQueueTime.data,
                    color: '#FFA726',
                    unit: spaceMetrics.value.workflowQueueTime.unit,
                },
            ],
            granularity: g,
        });
    });

    const doraCards = computed(() => {
        if (!doraMetrics.value) return [];
        const m = doraMetrics.value;
        return [
            {
                title: 'Deploy Frequency',
                icon: Rocket,
                value: m.deploymentFrequency.summary.current,
                unit: m.deploymentFrequency.unit,
                trend: m.deploymentFrequency.summary.trend,
            },
            {
                title: 'Lead Time',
                icon: Clock,
                value: m.leadTimeForChanges.summary.current,
                unit: m.leadTimeForChanges.unit,
                trend: m.leadTimeForChanges.summary.trend,
                invertTrend: true,
            },
            {
                title: 'Change Failure',
                icon: AlertCircle,
                value: m.changeFailureRate.summary.current,
                unit: m.changeFailureRate.unit,
                trend: m.changeFailureRate.summary.trend,
                invertTrend: true,
            },
            {
                title: 'MTTR',
                icon: Wrench,
                value: m.meanTimeToRecovery.summary.current,
                unit: m.meanTimeToRecovery.unit,
                trend: m.meanTimeToRecovery.summary.trend,
                invertTrend: true,
            },
        ];
    });

    const spaceCards = computed(() => {
        if (!spaceMetrics.value) return [];
        const m = spaceMetrics.value;
        return [
            {title: 'PR Merge Rate', icon: Zap, value: m.prMergeRate.summary.current, unit: m.prMergeRate.unit, trend: m.prMergeRate.summary.trend},
            {
                title: 'Activity',
                icon: BarChart3,
                value: m.activityVolume.summary.current,
                unit: m.activityVolume.unit,
                trend: m.activityVolume.summary.trend,
            },
            {
                title: 'Contributors',
                icon: Users,
                value: m.contributorCount.summary.current,
                unit: m.contributorCount.unit,
                trend: m.contributorCount.summary.trend,
            },
            {
                title: 'CI Duration',
                icon: Clock,
                value: m.ciDuration.summary.current,
                unit: m.ciDuration.unit,
                trend: m.ciDuration.summary.trend,
                invertTrend: true,
            },
        ];
    });
</script>

<template>
    <div class="flex h-full">
        <DashboardSidebar />

        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 class="text-xl font-bold">{{ dashboard?.title ?? 'Dashboard' }}</h1>
                    <p
                        v-if="dashboard?.description"
                        class="text-sm text-muted-foreground mt-0.5"
                    >
                        {{ dashboard.description }}
                    </p>
                </div>

                <div
                    v-if="isSystem"
                    class="flex flex-wrap gap-2"
                >
                    <!-- Integration picker -->
                    <select
                        v-model="selectedIntegration"
                        class="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option
                            value=""
                            disabled
                        >
                            Integration
                        </option>
                        <option
                            v-for="i in integrations"
                            :key="i.integrationId"
                            :value="i.integrationId"
                        >
                            {{ i.label }}
                        </option>
                    </select>

                    <!-- Repository picker -->
                    <select
                        v-model="filter.repositoryId"
                        class="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option :value="undefined">All repos</option>
                        <option
                            v-for="r in repositories"
                            :key="r.id"
                            :value="r.id"
                        >
                            {{ r.name }}
                        </option>
                    </select>

                    <!-- Granularity -->
                    <div class="inline-flex rounded-lg border border-border overflow-hidden">
                        <button
                            v-for="g in granularityOptions"
                            :key="g.value"
                            :class="[
                                'px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                                filter.granularity === g.value
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-background text-muted-foreground hover:bg-muted',
                            ]"
                            @click="filter.granularity = g.value"
                        >
                            {{ g.label }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- No integration -->
            <div
                v-if="isSystem && integrations.length === 0 && !isLoadingDora && !isLoadingSpace"
                class="rounded-xl border bg-card p-8 text-center"
            >
                <Lock class="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p class="mt-2 text-sm text-muted-foreground">Create an integration first to view metrics.</p>
            </div>

            <!-- DORA Dashboard -->
            <template v-if="isDora && selectedIntegration">
                <!-- Loading -->
                <div
                    v-if="isLoadingDora"
                    class="grid grid-cols-2 lg:grid-cols-4 gap-4"
                >
                    <Skeleton
                        v-for="n in 4"
                        :key="n"
                        class="h-24 rounded-xl"
                    />
                </div>

                <template v-else-if="doraMetrics">
                    <!-- Summary cards -->
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div
                            v-for="card in doraCards"
                            :key="card.title"
                            class="rounded-xl border bg-card p-4"
                        >
                            <div class="flex items-center gap-2 text-muted-foreground mb-2">
                                <component
                                    :is="card.icon"
                                    class="h-4 w-4"
                                />
                                <span class="text-xs font-medium">{{ card.title }}</span>
                            </div>
                            <div class="flex items-baseline gap-2">
                                <span class="text-2xl font-bold">{{
                                    typeof card.value === 'number' ? Math.round(card.value * 10) / 10 : card.value
                                }}</span>
                                <span class="text-xs text-muted-foreground">{{ card.unit }}</span>
                            </div>
                            <div
                                class="flex items-center gap-1 mt-1"
                                :class="trendColor(card.trend, card.invertTrend)"
                            >
                                <component
                                    :is="trendIcon(card.trend)"
                                    class="h-3 w-3"
                                />
                                <span class="text-xs capitalize">{{ card.trend }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Charts -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div class="rounded-xl border bg-card p-4">
                            <h3 class="text-sm font-medium mb-3">Deployment Frequency</h3>
                            <EChart
                                v-if="deployFreqChart"
                                :option="deployFreqChart"
                                height="280px"
                            />
                        </div>
                        <div class="rounded-xl border bg-card p-4">
                            <h3 class="text-sm font-medium mb-3">Lead Time for Changes</h3>
                            <EChart
                                v-if="leadTimeChart"
                                :option="leadTimeChart"
                                height="280px"
                            />
                        </div>
                        <div class="rounded-xl border bg-card p-4">
                            <h3 class="text-sm font-medium mb-3">Change Failure Rate</h3>
                            <EChart
                                v-if="changeFailureChart"
                                :option="changeFailureChart"
                                height="280px"
                            />
                        </div>
                        <div class="rounded-xl border bg-card p-4">
                            <h3 class="text-sm font-medium mb-3">Mean Time to Recovery</h3>
                            <EChart
                                v-if="mttrChart"
                                :option="mttrChart"
                                height="280px"
                            />
                        </div>
                    </div>
                </template>

                <!-- Empty state -->
                <div
                    v-else
                    class="rounded-xl border bg-card p-8 text-center"
                >
                    <Info class="mx-auto h-10 w-10 text-muted-foreground/40" />
                    <p class="mt-2 text-sm text-muted-foreground">No DORA metrics available for this integration yet.</p>
                </div>
            </template>

            <!-- SPACE Dashboard -->
            <template v-if="isSpace && selectedIntegration">
                <div
                    v-if="isLoadingSpace"
                    class="grid grid-cols-2 lg:grid-cols-4 gap-4"
                >
                    <Skeleton
                        v-for="n in 4"
                        :key="n"
                        class="h-24 rounded-xl"
                    />
                </div>

                <template v-else-if="spaceMetrics">
                    <!-- Summary cards -->
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div
                            v-for="card in spaceCards"
                            :key="card.title"
                            class="rounded-xl border bg-card p-4"
                        >
                            <div class="flex items-center gap-2 text-muted-foreground mb-2">
                                <component
                                    :is="card.icon"
                                    class="h-4 w-4"
                                />
                                <span class="text-xs font-medium">{{ card.title }}</span>
                            </div>
                            <div class="flex items-baseline gap-2">
                                <span class="text-2xl font-bold">{{
                                    typeof card.value === 'number' ? Math.round(card.value * 10) / 10 : card.value
                                }}</span>
                                <span class="text-xs text-muted-foreground">{{ card.unit }}</span>
                            </div>
                            <div
                                class="flex items-center gap-1 mt-1"
                                :class="trendColor(card.trend, card.invertTrend)"
                            >
                                <component
                                    :is="trendIcon(card.trend)"
                                    class="h-3 w-3"
                                />
                                <span class="text-xs capitalize">{{ card.trend }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Charts -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div class="rounded-xl border bg-card p-4">
                            <h3 class="text-sm font-medium mb-3">
                                <div class="flex items-center gap-2">
                                    <Smile class="h-4 w-4 text-muted-foreground" />
                                    PR Merge Rate
                                </div>
                            </h3>
                            <EChart
                                v-if="mergeRateGauge"
                                :option="mergeRateGauge"
                                height="220px"
                            />
                        </div>
                        <div class="rounded-xl border bg-card p-4">
                            <h3 class="text-sm font-medium mb-3">Activity Volume</h3>
                            <EChart
                                v-if="activityChart"
                                :option="activityChart"
                                height="280px"
                            />
                        </div>
                        <div class="rounded-xl border bg-card p-4">
                            <h3 class="text-sm font-medium mb-3">Active Contributors</h3>
                            <EChart
                                v-if="contributorChart"
                                :option="contributorChart"
                                height="280px"
                            />
                        </div>
                        <div class="rounded-xl border bg-card p-4">
                            <h3 class="text-sm font-medium mb-3">Efficiency (CI / PR Cycle / Queue)</h3>
                            <EChart
                                v-if="efficiencyChart"
                                :option="efficiencyChart"
                                height="280px"
                            />
                        </div>
                    </div>
                </template>

                <div
                    v-else
                    class="rounded-xl border bg-card p-8 text-center"
                >
                    <Info class="mx-auto h-10 w-10 text-muted-foreground/40" />
                    <p class="mt-2 text-sm text-muted-foreground">No SPACE metrics available for this integration yet.</p>
                </div>
            </template>

            <!-- User Dashboard (custom widgets) -->
            <template v-if="!isSystem && dashboard">
                <CustomMetricsDashboard
                    :dashboard-id="dashboardId"
                    :integration-id="selectedIntegration"
                />
            </template>
        </div>
    </div>
</template>
