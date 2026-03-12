<script setup lang="ts">
    import EChart from '@/components/charts/EChart.vue';
    import CustomMetricsDashboard from '@/components/CustomMetricsDashboard.vue';
    import {useChartTheme} from '@/composables/useChartTheme';
    import {useIntegration} from '@/composables/useIntegration';
    import {useMetrics} from '@/composables/useMetrics';
    import type {Integration} from '@common/types';
    import type {Granularity, MetricResult, MetricsFilter} from '@common/types/metrics';
    import {computed, onMounted, ref, watch} from 'vue';

    const {getIntegrations} = useIntegration();
    const {doraMetrics, spaceMetrics, isLoadingDora, isLoadingSpace, error, fetchDoraMetrics, fetchSpaceMetrics, fetchRepositories} = useMetrics();
    const {palette, buildLineChart, buildBarChart, buildGaugeChart, buildMultiLineChart} = useChartTheme();

    const integrations = ref<Integration[]>([]);
    const selectedIntegration = ref<string | null>(null);
    const repositoryOptions = ref<{id: number; name: string}[]>([]);
    const selectedRepository = ref<number | null>(null);
    const activeTab = ref('dora');
    const granularity = ref<Granularity>('week');
    const dateRange = ref<'30' | '90' | '180' | '365'>('90');

    const isLoading = computed(() => isLoadingDora.value || isLoadingSpace.value);

    const filter = computed<MetricsFilter>(() => {
        const to = new Date();
        const from = new Date(to.getTime() - Number(dateRange.value) * 24 * 60 * 60 * 1000);
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            granularity: granularity.value,
            repositoryId: selectedRepository.value ?? undefined,
        };
    });

    async function loadMetrics() {
        if (!selectedIntegration.value) return;
        if (activeTab.value === 'dora') {
            await fetchDoraMetrics(selectedIntegration.value, filter.value);
        } else if (activeTab.value === 'space') {
            await fetchSpaceMetrics(selectedIntegration.value, filter.value);
        }
    }

    async function loadFilterOptions(integrationId: string) {
        repositoryOptions.value = await fetchRepositories(integrationId);
    }

    onMounted(async () => {
        integrations.value = (await getIntegrations()) ?? [];
        if (integrations.value.length > 0) {
            selectedIntegration.value = integrations.value[0].integrationId;
        }
    });

    watch(selectedIntegration, async (newId) => {
        selectedRepository.value = null;
        if (newId) {
            await loadFilterOptions(newId);
        }
        loadMetrics();
    });

    watch([granularity, dateRange, selectedRepository], () => {
        loadMetrics();
    });

    watch(activeTab, () => {
        loadMetrics();
    });

    // --- Chart option builders ---

    function trendIcon(trend: string) {
        if (trend === 'up') return 'mdi-trending-up';
        if (trend === 'down') return 'mdi-trending-down';
        return 'mdi-trending-neutral';
    }

    function trendColor(trend: string, invertGood = false) {
        if (trend === 'up') return invertGood ? 'error' : 'success';
        if (trend === 'down') return invertGood ? 'success' : 'error';
        return 'grey';
    }

    function formatSummary(m: MetricResult) {
        if (m.unit === '%') return `${m.summary.current}%`;
        if (m.unit === 'hours') return `${m.summary.current}h`;
        if (m.unit === 'minutes') return `${m.summary.current}m`;
        return String(m.summary.current);
    }

    const deployFreqChart = computed(() => {
        if (!doraMetrics.value) return {};
        return buildBarChart({
            title: 'Deployment Frequency',
            data: doraMetrics.value.deploymentFrequency.data,
            unit: 'deployments',
            granularity: granularity.value,
            color: palette.value.success,
        });
    });

    const leadTimeChart = computed(() => {
        if (!doraMetrics.value) return {};
        return buildLineChart({
            title: 'Lead Time for Changes',
            data: doraMetrics.value.leadTimeForChanges.data,
            unit: 'hours',
            granularity: granularity.value,
            color: palette.value.info,
            areaStyle: true,
        });
    });

    const changeFailureChart = computed(() => {
        if (!doraMetrics.value) return {};
        return buildLineChart({
            title: 'Change Failure Rate',
            data: doraMetrics.value.changeFailureRate.data,
            unit: '%',
            granularity: granularity.value,
            color: palette.value.warning,
            areaStyle: true,
            markLines: [
                {value: 15, label: 'High', color: palette.value.error},
                {value: 5, label: 'Elite', color: palette.value.success},
            ],
        });
    });

    const mttrChart = computed(() => {
        if (!doraMetrics.value) return {};
        return buildLineChart({
            title: 'Mean Time to Recovery',
            data: doraMetrics.value.meanTimeToRecovery.data,
            unit: 'hours',
            granularity: granularity.value,
            color: palette.value.error,
            areaStyle: true,
        });
    });

    // SPACE charts
    const mergeRateGauge = computed(() => {
        if (!spaceMetrics.value) return {};
        return buildGaugeChart({
            value: spaceMetrics.value.prMergeRate.summary.current,
            title: 'Merge Rate',
            color: palette.value.success,
        });
    });

    const activityChart = computed(() => {
        if (!spaceMetrics.value) return {};
        return buildBarChart({
            title: 'Activity Volume',
            data: spaceMetrics.value.activityVolume.data,
            unit: 'events',
            granularity: granularity.value,
            color: palette.value.primary,
        });
    });

    const contributorChart = computed(() => {
        if (!spaceMetrics.value) return {};
        return buildLineChart({
            title: 'Contributors',
            data: spaceMetrics.value.contributorCount.data,
            unit: 'contributors',
            granularity: granularity.value,
            color: palette.value.info,
            areaStyle: true,
        });
    });

    const efficiencyChart = computed(() => {
        if (!spaceMetrics.value) return {};
        const c = palette.value;
        return buildMultiLineChart({
            series: [
                {name: 'CI Duration (min)', data: spaceMetrics.value.ciDuration.data, color: c.series[0], unit: 'min'},
                {name: 'PR Cycle Time (hrs)', data: spaceMetrics.value.prCycleTime.data, color: c.series[1], unit: 'hrs'},
                {name: 'Queue Time (min)', data: spaceMetrics.value.workflowQueueTime.data, color: c.series[2], unit: 'min'},
            ],
            granularity: granularity.value,
        });
    });

    const dateRangeOptions = [
        {title: '30 days', value: '30'},
        {title: '90 days', value: '90'},
        {title: '6 months', value: '180'},
        {title: '1 year', value: '365'},
    ];

    const granularityOptions = [
        {title: 'Day', value: 'day'},
        {title: 'Week', value: 'week'},
        {title: 'Month', value: 'month'},
    ];

    const doraDescriptions: Record<string, string> = {
        deploymentFrequency: 'How often code is deployed to production. Proxied from successful workflow runs on the default branch.',
        leadTimeForChanges: 'Time from PR creation to merge. Measures how long it takes for code to go from development to production.',
        changeFailureRate: 'Percentage of deployments that result in failure. Lower is better.',
        meanTimeToRecovery: 'Average time between a failed deployment and the next successful one on the same workflow.',
    };
</script>

<template>
    <v-main>
        <v-container
            fluid
            class="pa-6"
        >
            <!-- Header & Filters -->
            <v-row
                align="center"
                class="mb-4"
            >
                <v-col cols="auto">
                    <h1 class="text-h4 font-weight-bold">Metrics</h1>
                    <p class="text-subtitle-2 text-medium-emphasis mt-1">DORA &amp; SPACE framework metrics for your engineering organization</p>
                </v-col>
                <v-spacer />
                <v-col
                    cols="auto"
                    class="d-flex ga-3 align-center"
                >
                    <v-select
                        v-model="selectedIntegration"
                        :items="integrations"
                        item-title="label"
                        item-value="integrationId"
                        label="Integration"
                        variant="outlined"
                        density="compact"
                        hide-details
                        style="min-width: 180px"
                    />
                    <v-select
                        v-model="selectedRepository"
                        :items="repositoryOptions"
                        item-title="name"
                        item-value="id"
                        label="Repository"
                        variant="outlined"
                        density="compact"
                        hide-details
                        clearable
                        style="min-width: 180px"
                    />
                    <v-select
                        v-model="dateRange"
                        :items="dateRangeOptions"
                        label="Time Range"
                        variant="outlined"
                        density="compact"
                        hide-details
                        style="min-width: 140px"
                    />
                    <v-btn-toggle
                        v-model="granularity"
                        mandatory
                        density="compact"
                        variant="outlined"
                        divided
                    >
                        <v-btn
                            v-for="opt in granularityOptions"
                            :key="opt.value"
                            :value="opt.value"
                            size="small"
                        >
                            {{ opt.title }}
                        </v-btn>
                    </v-btn-toggle>
                </v-col>
            </v-row>

            <!-- Error Alert -->
            <v-alert
                v-if="error"
                type="error"
                variant="tonal"
                closable
                class="mb-4"
            >
                {{ error }}
            </v-alert>

            <!-- Loading State -->
            <v-progress-linear
                v-if="isLoading"
                indeterminate
                color="primary"
                class="mb-4"
            />

            <!-- Tabs -->
            <v-tabs
                v-model="activeTab"
                color="primary"
                class="mb-6"
            >
                <v-tab value="dora">
                    <v-icon
                        start
                        size="small"
                        >mdi-rocket-launch</v-icon
                    >
                    DORA Metrics
                </v-tab>
                <v-tab value="space">
                    <v-icon
                        start
                        size="small"
                        >mdi-account-group</v-icon
                    >
                    SPACE Framework
                </v-tab>
                <v-tab value="custom">
                    <v-icon
                        start
                        size="small"
                        >mdi-chart-box-plus-outline</v-icon
                    >
                    Custom
                </v-tab>
            </v-tabs>

            <!-- DORA Tab -->
            <v-tabs-window v-model="activeTab">
                <v-tabs-window-item value="dora">
                    <v-row v-if="doraMetrics">
                        <!-- Deployment Frequency -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="success"
                                                size="small"
                                                class="mr-2"
                                                >mdi-rocket-launch</v-icon
                                            >
                                            Deployment Frequency
                                            <v-tooltip location="top">
                                                <template #activator="{props: tp}">
                                                    <v-icon
                                                        v-bind="tp"
                                                        size="x-small"
                                                        class="ml-2 text-medium-emphasis"
                                                        >mdi-information-outline</v-icon
                                                    >
                                                </template>
                                                {{ doraDescriptions.deploymentFrequency }}
                                            </v-tooltip>
                                        </div>
                                    </template>
                                    <template #subtitle>
                                        <div class="d-flex align-center mt-1">
                                            <span class="text-h5 font-weight-bold mr-2">{{ formatSummary(doraMetrics.deploymentFrequency) }}</span>
                                            <span class="text-caption text-medium-emphasis">per {{ granularity }}</span>
                                            <v-icon
                                                :icon="trendIcon(doraMetrics.deploymentFrequency.summary.trend)"
                                                :color="trendColor(doraMetrics.deploymentFrequency.summary.trend)"
                                                size="small"
                                                class="ml-2"
                                            />
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text class="pt-0">
                                    <EChart
                                        :option="deployFreqChart"
                                        height="240px"
                                        :loading="isLoadingDora"
                                    />
                                </v-card-text>
                            </v-card>
                        </v-col>

                        <!-- Lead Time for Changes -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="info"
                                                size="small"
                                                class="mr-2"
                                                >mdi-clock-fast</v-icon
                                            >
                                            Lead Time for Changes
                                            <v-tooltip location="top">
                                                <template #activator="{props: tp}">
                                                    <v-icon
                                                        v-bind="tp"
                                                        size="x-small"
                                                        class="ml-2 text-medium-emphasis"
                                                        >mdi-information-outline</v-icon
                                                    >
                                                </template>
                                                {{ doraDescriptions.leadTimeForChanges }}
                                            </v-tooltip>
                                        </div>
                                    </template>
                                    <template #subtitle>
                                        <div class="d-flex align-center mt-1">
                                            <span class="text-h5 font-weight-bold mr-2">{{ formatSummary(doraMetrics.leadTimeForChanges) }}</span>
                                            <span class="text-caption text-medium-emphasis">avg</span>
                                            <v-icon
                                                :icon="trendIcon(doraMetrics.leadTimeForChanges.summary.trend)"
                                                :color="trendColor(doraMetrics.leadTimeForChanges.summary.trend, true)"
                                                size="small"
                                                class="ml-2"
                                            />
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text class="pt-0">
                                    <EChart
                                        :option="leadTimeChart"
                                        height="240px"
                                        :loading="isLoadingDora"
                                    />
                                </v-card-text>
                            </v-card>
                        </v-col>

                        <!-- Change Failure Rate -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="warning"
                                                size="small"
                                                class="mr-2"
                                                >mdi-alert-circle</v-icon
                                            >
                                            Change Failure Rate
                                            <v-tooltip location="top">
                                                <template #activator="{props: tp}">
                                                    <v-icon
                                                        v-bind="tp"
                                                        size="x-small"
                                                        class="ml-2 text-medium-emphasis"
                                                        >mdi-information-outline</v-icon
                                                    >
                                                </template>
                                                {{ doraDescriptions.changeFailureRate }}
                                            </v-tooltip>
                                        </div>
                                    </template>
                                    <template #subtitle>
                                        <div class="d-flex align-center mt-1">
                                            <span class="text-h5 font-weight-bold mr-2">{{ formatSummary(doraMetrics.changeFailureRate) }}</span>
                                            <v-icon
                                                :icon="trendIcon(doraMetrics.changeFailureRate.summary.trend)"
                                                :color="trendColor(doraMetrics.changeFailureRate.summary.trend, true)"
                                                size="small"
                                                class="ml-2"
                                            />
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text class="pt-0">
                                    <EChart
                                        :option="changeFailureChart"
                                        height="240px"
                                        :loading="isLoadingDora"
                                    />
                                </v-card-text>
                            </v-card>
                        </v-col>

                        <!-- Mean Time to Recovery -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="error"
                                                size="small"
                                                class="mr-2"
                                                >mdi-wrench-clock</v-icon
                                            >
                                            Mean Time to Recovery
                                            <v-tooltip location="top">
                                                <template #activator="{props: tp}">
                                                    <v-icon
                                                        v-bind="tp"
                                                        size="x-small"
                                                        class="ml-2 text-medium-emphasis"
                                                        >mdi-information-outline</v-icon
                                                    >
                                                </template>
                                                {{ doraDescriptions.meanTimeToRecovery }}
                                            </v-tooltip>
                                        </div>
                                    </template>
                                    <template #subtitle>
                                        <div class="d-flex align-center mt-1">
                                            <span class="text-h5 font-weight-bold mr-2">{{ formatSummary(doraMetrics.meanTimeToRecovery) }}</span>
                                            <span class="text-caption text-medium-emphasis">avg</span>
                                            <v-icon
                                                :icon="trendIcon(doraMetrics.meanTimeToRecovery.summary.trend)"
                                                :color="trendColor(doraMetrics.meanTimeToRecovery.summary.trend, true)"
                                                size="small"
                                                class="ml-2"
                                            />
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text class="pt-0">
                                    <EChart
                                        :option="mttrChart"
                                        height="240px"
                                        :loading="isLoadingDora"
                                    />
                                </v-card-text>
                            </v-card>
                        </v-col>
                    </v-row>

                    <!-- Empty state for DORA -->
                    <v-row v-else-if="!isLoadingDora">
                        <v-col>
                            <v-card
                                variant="outlined"
                                class="rounded-lg pa-8 text-center"
                            >
                                <v-icon
                                    size="64"
                                    color="grey"
                                    class="mb-4"
                                    >mdi-chart-line</v-icon
                                >
                                <h3 class="text-h6 text-medium-emphasis">No DORA metrics available</h3>
                                <p class="text-body-2 text-medium-emphasis mt-2">
                                    Select an integration and ensure workflow data has been imported to view DORA metrics.
                                </p>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-tabs-window-item>

                <!-- SPACE Tab -->
                <v-tabs-window-item value="space">
                    <v-row v-if="spaceMetrics">
                        <!-- Satisfaction (placeholder) -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                                style="height: 450px; display: flex; flex-direction: column"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="pink"
                                                size="small"
                                                class="mr-2"
                                                >mdi-emoticon-happy</v-icon
                                            >
                                            Satisfaction &amp; Well-being
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text>
                                    <div
                                        class="d-flex flex-column align-center justify-center"
                                        style="min-height: 240px"
                                    >
                                        <v-icon
                                            size="48"
                                            color="grey"
                                            class="mb-3"
                                            >mdi-chart-timeline-variant-shimmer</v-icon
                                        >
                                        <p class="text-body-2 text-medium-emphasis text-center px-4">
                                            Coming soon — Requires developer survey integration to measure satisfaction, work-life balance, and
                                            developer experience.
                                        </p>
                                        <v-chip
                                            color="info"
                                            variant="tonal"
                                            size="small"
                                            class="mt-3"
                                            >Planned</v-chip
                                        >
                                    </div>
                                </v-card-text>
                            </v-card>
                        </v-col>

                        <!-- Performance: PR Merge Rate -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                                style="height: 450px; display: flex; flex-direction: column"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="success"
                                                size="small"
                                                class="mr-2"
                                                >mdi-speedometer</v-icon
                                            >
                                            Performance
                                            <v-tooltip location="top">
                                                <template #activator="{props: tp}">
                                                    <v-icon
                                                        v-bind="tp"
                                                        size="x-small"
                                                        class="ml-2 text-medium-emphasis"
                                                        >mdi-information-outline</v-icon
                                                    >
                                                </template>
                                                PR merge rate — percentage of closed PRs that were merged vs. closed without merge.
                                            </v-tooltip>
                                        </div>
                                    </template>
                                    <template #subtitle>
                                        <div class="d-flex align-center mt-1">
                                            <span class="text-h5 font-weight-bold mr-2">{{ formatSummary(spaceMetrics.prMergeRate) }}</span>
                                            <span class="text-caption text-medium-emphasis">merge rate</span>
                                            <v-icon
                                                :icon="trendIcon(spaceMetrics.prMergeRate.summary.trend)"
                                                :color="trendColor(spaceMetrics.prMergeRate.summary.trend)"
                                                size="small"
                                                class="ml-2"
                                            />
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text class="pt-0">
                                    <EChart
                                        :option="mergeRateGauge"
                                        height="240px"
                                        :loading="isLoadingSpace"
                                    />
                                </v-card-text>
                            </v-card>
                        </v-col>

                        <!-- Activity: Volume + Contributors -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                                style="height: 450px; display: flex; flex-direction: column"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="primary"
                                                size="small"
                                                class="mr-2"
                                                >mdi-pulse</v-icon
                                            >
                                            Activity
                                            <v-tooltip location="top">
                                                <template #activator="{props: tp}">
                                                    <v-icon
                                                        v-bind="tp"
                                                        size="x-small"
                                                        class="ml-2 text-medium-emphasis"
                                                        >mdi-information-outline</v-icon
                                                    >
                                                </template>
                                                Combined count of PRs and workflow runs per period — a measure of development velocity.
                                            </v-tooltip>
                                        </div>
                                    </template>
                                    <template #subtitle>
                                        <div class="d-flex align-center mt-1">
                                            <span class="text-h5 font-weight-bold mr-2">{{ formatSummary(spaceMetrics.activityVolume) }}</span>
                                            <span class="text-caption text-medium-emphasis">events/{{ granularity }}</span>
                                            <v-icon
                                                :icon="trendIcon(spaceMetrics.activityVolume.summary.trend)"
                                                :color="trendColor(spaceMetrics.activityVolume.summary.trend)"
                                                size="small"
                                                class="ml-2"
                                            />
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text class="pt-0">
                                    <EChart
                                        :option="activityChart"
                                        height="240px"
                                        :loading="isLoadingSpace"
                                    />
                                </v-card-text>
                            </v-card>
                        </v-col>

                        <!-- Communication (placeholder) -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                                style="height: 450px; display: flex; flex-direction: column"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="deep-purple"
                                                size="small"
                                                class="mr-2"
                                                >mdi-forum</v-icon
                                            >
                                            Communication &amp; Collaboration
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text>
                                    <div
                                        class="d-flex flex-column"
                                        style="min-height: 240px"
                                    >
                                        <div class="d-flex flex-column align-center justify-center flex-grow-1">
                                            <v-icon
                                                size="40"
                                                color="grey"
                                                class="mb-2"
                                                >mdi-message-text-clock</v-icon
                                            >
                                            <p class="text-body-2 text-medium-emphasis text-center px-4">
                                                Limited data — Full metrics require PR review data.
                                            </p>
                                            <v-chip
                                                color="warning"
                                                variant="tonal"
                                                size="small"
                                                class="mt-2"
                                                >Limited</v-chip
                                            >
                                        </div>
                                        <div class="mt-2">
                                            <p class="text-caption text-medium-emphasis mb-1">Contributors as proxy:</p>
                                            <EChart
                                                :option="contributorChart"
                                                height="140px"
                                                :loading="isLoadingSpace"
                                            />
                                        </div>
                                    </div>
                                </v-card-text>
                            </v-card>
                        </v-col>

                        <!-- Efficiency -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                                style="height: 450px; display: flex; flex-direction: column"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="teal"
                                                size="small"
                                                class="mr-2"
                                                >mdi-lightning-bolt</v-icon
                                            >
                                            Efficiency &amp; Flow
                                            <v-tooltip location="top">
                                                <template #activator="{props: tp}">
                                                    <v-icon
                                                        v-bind="tp"
                                                        size="x-small"
                                                        class="ml-2 text-medium-emphasis"
                                                        >mdi-information-outline</v-icon
                                                    >
                                                </template>
                                                CI job duration, PR cycle time (created → merged), and workflow queue time — key indicators of
                                                development efficiency.
                                            </v-tooltip>
                                        </div>
                                    </template>
                                    <template #subtitle>
                                        <div class="d-flex ga-4 mt-1 flex-wrap">
                                            <div>
                                                <span class="text-caption text-medium-emphasis">CI Duration:</span>
                                                <span class="text-body-2 font-weight-bold ml-1">{{ formatSummary(spaceMetrics.ciDuration) }}</span>
                                            </div>
                                            <div>
                                                <span class="text-caption text-medium-emphasis">PR Cycle:</span>
                                                <span class="text-body-2 font-weight-bold ml-1">{{ formatSummary(spaceMetrics.prCycleTime) }}</span>
                                            </div>
                                            <div>
                                                <span class="text-caption text-medium-emphasis">Queue Time:</span>
                                                <span class="text-body-2 font-weight-bold ml-1">{{
                                                    formatSummary(spaceMetrics.workflowQueueTime)
                                                }}</span>
                                            </div>
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text class="pt-0">
                                    <EChart
                                        :option="efficiencyChart"
                                        height="240px"
                                        :loading="isLoadingSpace"
                                    />
                                </v-card-text>
                            </v-card>
                        </v-col>

                        <!-- Placeholder for future metric (maintains 2x3 grid) -->
                        <v-col
                            cols="12"
                            md="6"
                        >
                            <v-card
                                variant="outlined"
                                class="rounded-lg"
                                style="height: 450px; display: flex; flex-direction: column"
                            >
                                <v-card-item>
                                    <template #title>
                                        <div class="d-flex align-center">
                                            <v-icon
                                                color="grey"
                                                size="small"
                                                class="mr-2"
                                                >mdi-dots-horizontal-circle</v-icon
                                            >
                                            Additional Metrics
                                        </div>
                                    </template>
                                </v-card-item>
                                <v-card-text>
                                    <div
                                        class="d-flex flex-column align-center justify-center"
                                        style="min-height: 240px"
                                    >
                                        <v-icon
                                            size="48"
                                            color="grey"
                                            class="mb-3"
                                            >mdi-chart-box-plus-outline</v-icon
                                        >
                                        <p class="text-body-2 text-medium-emphasis text-center px-4">
                                            More SPACE metrics coming soon — code review depth, handoff patterns, and cross-team collaboration.
                                        </p>
                                        <v-chip
                                            color="info"
                                            variant="tonal"
                                            size="small"
                                            class="mt-3"
                                            >Planned</v-chip
                                        >
                                    </div>
                                </v-card-text>
                            </v-card>
                        </v-col>
                    </v-row>

                    <!-- Empty state for SPACE -->
                    <v-row v-else-if="!isLoadingSpace">
                        <v-col>
                            <v-card
                                variant="outlined"
                                class="rounded-lg pa-8 text-center"
                            >
                                <v-icon
                                    size="64"
                                    color="grey"
                                    class="mb-4"
                                    >mdi-account-group</v-icon
                                >
                                <h3 class="text-h6 text-medium-emphasis">No SPACE metrics available</h3>
                                <p class="text-body-2 text-medium-emphasis mt-2">
                                    Select an integration and ensure workflow and PR data has been imported to view SPACE metrics.
                                </p>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-tabs-window-item>

                <!-- Custom Tab -->
                <v-tabs-window-item value="custom">
                    <CustomMetricsDashboard :integration-id="selectedIntegration" />
                </v-tabs-window-item>
            </v-tabs-window>
        </v-container>
    </v-main>
</template>
