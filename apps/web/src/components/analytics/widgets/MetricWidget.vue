<script setup lang="ts">
    import ChartTypeToggle from '@/components/analytics/widgets/ChartTypeToggle.vue';
    import Card from '@/components/ui/Card.vue';
    import Tooltip from '@/components/ui/Tooltip.vue';
    import type {WidgetChartType, WidgetSize} from '@/types/analytics';
    import type {MetricResult} from '@common/types';
    import {format, parseISO} from 'date-fns';
    import {BarChart, LineChart} from 'echarts/charts';
    import {GridComponent, TitleComponent, TooltipComponent} from 'echarts/components';
    import {use} from 'echarts/core';
    import {CanvasRenderer} from 'echarts/renderers';
    import {Info} from 'lucide-vue-next';
    import {computed, ref, watch} from 'vue';
    import VChart from 'vue-echarts';

    use([CanvasRenderer, BarChart, LineChart, GridComponent, TitleComponent, TooltipComponent]);

    const SERIES_COLORS = ['#6366f1', '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#a855f7', '#eab308', '#ef4444', '#14b8a6', '#8b5cf6'];
    const BAR_STYLE = {borderRadius: [2, 2, 0, 0] as [number, number, number, number]};
    const BAR_MAX_WIDTH = 16;

    const props = withDefaults(
        defineProps<{
            title: string;
            size: WidgetSize;
            metric: MetricResult | null;
            isLoading: boolean;
            color?: string;
            description?: string;
            comingSoon?: boolean;
        }>(),
        {color: undefined, description: undefined, comingSoon: false},
    );

    const hasMultiSeries = computed(() => !!props.metric?.series?.length);

    const defaultChartType = computed<WidgetChartType>(() => {
        if (hasMultiSeries.value) {
            return props.metric?.unit === '%' ? 'line' : 'stacked-bar';
        }
        return 'bar';
    });

    const selectedChartType = ref<WidgetChartType>(defaultChartType.value);

    // Reset to smart default when data shape changes (e.g. groupBy toggled)
    watch(defaultChartType, (newDefault, oldDefault) => {
        if (newDefault !== oldDefault) {
            selectedChartType.value = newDefault;
        }
    });

    // Clamp selection when stacked-bar becomes unavailable (multi → single series)
    watch(hasMultiSeries, (multi) => {
        if (!multi && selectedChartType.value === 'stacked-bar') {
            selectedChartType.value = 'bar';
        }
    });

    const sizeClass = computed(() => {
        const map: Record<WidgetSize, string> = {
            small: 'col-span-1',
            medium: 'col-span-1 md:col-span-2',
            large: 'col-span-1 md:col-span-3',
            full: 'col-span-1 md:col-span-4',
        };
        return map[props.size];
    });

    const HOUR_MS = 3_600_000;

    /** Collect all unique, sorted period strings from either data or series. */
    const allPeriods = computed<string[]>(() => {
        const data = props.metric?.data;
        if (data?.length) return data.map((d) => d.period);
        const series = props.metric?.series;
        if (!series?.length) return [];
        const set = new Set<string>();
        for (const s of series) for (const d of s.data) set.add(d.period);
        return Array.from(set).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    });

    const dataInfo = computed(() => {
        const periods = allPeriods.value;
        if (periods.length < 2) return {stepMs: 0};
        const stepMs = new Date(periods[1]).getTime() - new Date(periods[0]).getTime();
        return {stepMs};
    });

    function dateFormatForStep(stepMs: number): string {
        if (stepMs <= HOUR_MS) return 'MMM d, HH:mm';
        if (stepMs <= HOUR_MS * 24) return 'MMM d';
        if (stepMs <= HOUR_MS * 24 * 7) return 'MMM d';
        return 'MMM yyyy';
    }

    function formatPeriod(period: string, stepMs: number): string {
        try {
            return format(parseISO(period), dateFormatForStep(stepMs));
        } catch {
            return period;
        }
    }

    function buildSingleSeries(values: number[], color: string, chartType: WidgetChartType) {
        if (chartType === 'line' || chartType === 'area') {
            return {
                type: 'line' as const,
                data: values,
                lineStyle: {width: 2, color},
                itemStyle: {color},
                ...(chartType === 'area' && {areaStyle: {color, opacity: 0.15}}),
                symbol: 'circle' as const,
                symbolSize: 4,
            };
        }
        return {
            type: 'bar' as const,
            data: values,
            itemStyle: {color, ...BAR_STYLE},
            barMaxWidth: BAR_MAX_WIDTH,
        };
    }

    function buildMultiSeries(seriesData: NonNullable<MetricResult['series']>, periods: string[], chartType: WidgetChartType) {
        return seriesData.map((s, i) => {
            const valueMap = new Map(s.data.map((d) => [d.period, d.value]));
            const color = SERIES_COLORS[i % SERIES_COLORS.length];
            const values = periods.map((p) => valueMap.get(p) ?? (chartType === 'bar' || chartType === 'stacked-bar' ? 0 : null));

            if (chartType === 'line' || chartType === 'area') {
                return {
                    type: 'line' as const,
                    name: s.groupLabel,
                    data: values,
                    lineStyle: {width: 2, color},
                    itemStyle: {color},
                    ...(chartType === 'area' && {areaStyle: {color, opacity: 0.15}}),
                    symbol: 'circle' as const,
                    symbolSize: 4,
                    connectNulls: false,
                };
            }
            if (chartType === 'stacked-bar') {
                return {
                    type: 'bar' as const,
                    name: s.groupLabel,
                    stack: 'grouped',
                    data: values,
                    itemStyle: {color, ...BAR_STYLE},
                    barMaxWidth: BAR_MAX_WIDTH,
                };
            }
            // bar (side-by-side)
            return {
                type: 'bar' as const,
                name: s.groupLabel,
                data: values,
                itemStyle: {color, ...BAR_STYLE},
                barMaxWidth: BAR_MAX_WIDTH,
            };
        });
    }

    const chartOption = computed(() => {
        const data = props.metric?.data;
        const seriesData = props.metric?.series;
        const periods = allPeriods.value;
        const barColor = props.color ?? '#6366f1';
        const chartType = selectedChartType.value;

        if (!periods.length) {
            return {
                title: [
                    {
                        text: 'No data available',
                        left: 'center',
                        top: 'middle',
                        textStyle: {fontSize: 12, color: '#9ca3af', fontWeight: 400},
                    },
                ],
            };
        }

        const {stepMs} = dataInfo.value;
        const labels = periods.map((p) => formatPeriod(p, stepMs));
        const labelInterval = periods.length <= 10 ? 0 : Math.max(0, Math.floor(periods.length / 5) - 1);

        const unitLabel = props.metric?.unit ?? '';

        const base = {
            grid: {top: unitLabel ? 20 : 12, right: 12, bottom: 24, left: 40},
            tooltip: {trigger: 'axis' as const, confine: true},
            xAxis: {
                type: 'category' as const,
                data: labels,
                axisLabel: {fontSize: 10, color: '#9ca3af', interval: labelInterval},
                axisLine: {show: false},
                axisTick: {show: false},
            },
            yAxis: {
                type: 'value' as const,
                splitNumber: 3,
                name: unitLabel,
                nameLocation: 'end' as const,
                nameTextStyle: {fontSize: 10, color: '#9ca3af', padding: [0, 0, 0, 0]},
                axisLabel: {fontSize: 10, color: '#9ca3af'},
                splitLine: {lineStyle: {color: '#e5e7eb', type: 'dashed' as const}},
            },
        };

        if (seriesData?.length) {
            return {...base, series: buildMultiSeries(seriesData, periods, chartType)};
        }

        return {
            ...base,
            series: [buildSingleSeries(data?.map((d) => d.value) ?? [], barColor, chartType)],
        };
    });
</script>

<template>
    <Card :class="sizeClass">
        <!-- Coming Soon placeholder -->
        <div
            v-if="comingSoon"
            class="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center"
            style="height: 200px"
        >
            <span class="text-sm font-semibold text-foreground">{{ title }}</span>
            <span class="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Coming Soon</span>
            <p
                v-if="description"
                class="max-w-xs text-xs text-muted-foreground leading-relaxed"
            >
                {{ description }}
            </p>
        </div>
        <!-- Chart with optional reload overlay -->
        <div
            v-else
            class="relative"
        >
            <!-- Widget header -->
            <div class="flex items-start justify-between px-3 pt-2.5">
                <div class="flex items-center gap-1">
                    <span class="text-sm font-semibold text-foreground">{{ title }}</span>
                    <Tooltip
                        v-if="description"
                        side="bottom"
                        content-class="max-w-xs"
                    >
                        <template #trigger>
                            <button
                                class="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                aria-label="Widget description"
                            >
                                <Info class="h-3.5 w-3.5" />
                            </button>
                        </template>
                        {{ description }}
                    </Tooltip>
                </div>
                <ChartTypeToggle
                    v-if="metric"
                    v-model="selectedChartType"
                    :has-multi-series="hasMultiSeries"
                    :disabled="isLoading"
                />
            </div>
            <Transition name="fade">
                <div
                    v-if="isLoading"
                    class="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-lg"
                >
                    <div class="h-5 w-5 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
                </div>
            </Transition>
            <VChart
                :option="chartOption"
                :update-options="{notMerge: true}"
                autoresize
                style="height: 160px; width: 100%"
                :class="{'opacity-50 transition-opacity duration-200': isLoading}"
            />
        </div>
    </Card>
</template>

<style scoped>
    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.15s ease;
    }
    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
