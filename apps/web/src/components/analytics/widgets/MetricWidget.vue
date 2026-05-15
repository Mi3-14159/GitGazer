<script setup lang="ts">
    import ChartTypeToggle from '@/components/analytics/widgets/ChartTypeToggle.vue';
    import Card from '@/components/ui/Card.vue';
    import Tooltip from '@/components/ui/Tooltip.vue';
    import type {WidgetChartType, WidgetSize} from '@/types/analytics';
    import type {Granularity, MetricResult} from '@common/types';
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
            granularity?: Granularity;
            from?: string;
            to?: string;
        }>(),
        {color: undefined, description: undefined, comingSoon: false, granularity: undefined, from: undefined, to: undefined},
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

    /** Truncate a Date to the start of the period in UTC (matching PostgreSQL date_trunc). */
    function truncateUTC(d: Date, granularity: Granularity): Date {
        const r = new Date(d);
        switch (granularity) {
            case 'hour':
                r.setUTCMinutes(0, 0, 0);
                break;
            case 'day':
                r.setUTCHours(0, 0, 0, 0);
                break;
            case 'week': {
                r.setUTCHours(0, 0, 0, 0);
                const dow = r.getUTCDay();
                r.setUTCDate(r.getUTCDate() - (dow === 0 ? 6 : dow - 1)); // ISO week starts Monday
                break;
            }
            case 'month':
                r.setUTCDate(1);
                r.setUTCHours(0, 0, 0, 0);
                break;
        }
        return r;
    }

    /** Advance a UTC date by one granularity step. */
    function advanceUTC(d: Date, granularity: Granularity): Date {
        const r = new Date(d);
        switch (granularity) {
            case 'hour':
                r.setUTCHours(r.getUTCHours() + 1);
                break;
            case 'day':
                r.setUTCDate(r.getUTCDate() + 1);
                break;
            case 'week':
                r.setUTCDate(r.getUTCDate() + 7);
                break;
            case 'month':
                r.setUTCMonth(r.getUTCMonth() + 1);
                break;
        }
        return r;
    }

    /** Generate all expected periods between from/to at the given granularity (UTC). */
    function generatePeriodRange(from: Date, to: Date, granularity: Granularity): string[] {
        if (from.getTime() > to.getTime()) return [];
        const MAX_PERIODS = 10_000;
        const periods: string[] = [];
        let cursor = truncateUTC(from, granularity);
        const end = to.getTime();
        while (cursor.getTime() <= end && periods.length < MAX_PERIODS) {
            periods.push(cursor.toISOString());
            cursor = advanceUTC(cursor, granularity);
        }
        return periods;
    }

    /** Collect all unique, sorted period strings from either data or series, filling gaps when possible. */
    const allPeriods = computed<string[]>(() => {
        // Collect periods that exist in the data
        const dataPeriods = new Set<string>();
        const data = props.metric?.data;
        if (data?.length) for (const d of data) dataPeriods.add(d.period);
        const series = props.metric?.series;
        if (series?.length) for (const s of series) for (const d of s.data) dataPeriods.add(d.period);
        if (!dataPeriods.size) return [];

        // If we have from/to/granularity, generate the full range
        if (props.from && props.to && props.granularity) {
            return generatePeriodRange(new Date(props.from), new Date(props.to), props.granularity);
        }

        // Fallback: return only the periods we have data for
        return Array.from(dataPeriods).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    });

    /** Date format config per granularity. axis = x-axis labels, tooltip = hover header. */
    const PERIOD_FORMATS: Record<string, {axis: string; tooltip: string}> = {
        hour: {axis: 'MMM d, HH:mm', tooltip: 'MMM d, yyyy HH:mm'},
        day: {axis: 'MMM d, yyyy', tooltip: 'MMM d, yyyy'},
        week: {axis: 'MMM d, yyyy', tooltip: "'Week of' MMM d, yyyy"},
        month: {axis: 'MMM yyyy', tooltip: 'MMM yyyy'},
    };

    const DEFAULT_FORMAT = {axis: 'MMM d, yyyy', tooltip: 'MMM d, yyyy'};

    const dateFormat = computed(() => {
        if (props.granularity) return PERIOD_FORMATS[props.granularity]?.axis ?? DEFAULT_FORMAT.axis;
        // Fallback: infer from data when granularity is not provided
        const periods = allPeriods.value;
        if (periods.length < 2) return DEFAULT_FORMAT.axis;
        const stepMs = new Date(periods[1]).getTime() - new Date(periods[0]).getTime();
        const HOUR_MS = 3_600_000;
        if (stepMs <= HOUR_MS) return 'MMM d, HH:mm';
        if (stepMs <= HOUR_MS * 24 * 7) return 'MMM d, yyyy';
        return 'MMM yyyy';
    });

    // NOTE: format(parseISO(...)) renders in the browser's local timezone.
    // For day/week/month granularity, UTC midnight maps to the same calendar date in most timezones.
    // For hourly granularity near UTC midnight, the displayed date may differ by one day.
    function formatPeriod(period: string): string {
        try {
            return format(parseISO(period), dateFormat.value);
        } catch {
            return period;
        }
    }

    function formatTooltipHeader(period: string): string {
        const fmt = props.granularity ? (PERIOD_FORMATS[props.granularity]?.tooltip ?? DEFAULT_FORMAT.tooltip) : dateFormat.value;
        try {
            return format(parseISO(period), fmt);
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

        const labels = periods.map((p) => formatPeriod(p));
        const labelInterval = periods.length <= 10 ? 0 : Math.max(0, Math.floor(periods.length / 5) - 1);

        const unitLabel = props.metric?.unit ?? '';

        const base = {
            grid: {top: unitLabel ? 20 : 12, right: 12, bottom: 24, left: 40},
            tooltip: {
                trigger: 'axis' as const,
                confine: true,
                formatter: (params: any) => {
                    const items = Array.isArray(params) ? params : [params];
                    if (!items.length) return '';
                    const idx = items[0].dataIndex;
                    const header = formatTooltipHeader(periods[idx]);
                    const lines = items
                        .filter((item: any) => item.value != null && item.value !== 0)
                        .map(
                            (item: any) =>
                                `${item.marker} ${item.seriesName ? `${item.seriesName}: ` : ''}${item.value}${unitLabel ? ` ${unitLabel}` : ''}`,
                        );
                    if (!lines.length) return `${header}<br/><span style="color:#9ca3af">No data</span>`;
                    return `${header}<br/>${lines.join('<br/>')}`;
                },
            },
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

        // Map single-series data onto the full period range
        const valueMap = new Map((data ?? []).map((d) => [d.period, d.value]));
        const values = periods.map((p) => valueMap.get(p) ?? 0);

        return {
            ...base,
            series: [buildSingleSeries(values, barColor, chartType)],
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
