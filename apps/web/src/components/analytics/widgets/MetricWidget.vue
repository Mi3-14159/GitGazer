<script setup lang="ts">
    import Card from '@/components/ui/Card.vue';
    import type {WidgetSize} from '@/types/analytics';
    import type {MetricResult} from '@common/types';
    import {format, parseISO} from 'date-fns';
    import {BarChart, LineChart} from 'echarts/charts';
    import {GraphicComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent} from 'echarts/components';
    import {use} from 'echarts/core';
    import {CanvasRenderer} from 'echarts/renderers';
    import {computed} from 'vue';
    import VChart from 'vue-echarts';

    use([CanvasRenderer, BarChart, LineChart, GraphicComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent]);

    const SERIES_COLORS = ['#6366f1', '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#a855f7', '#eab308', '#ef4444', '#14b8a6', '#8b5cf6'];

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

    const sizeClass = computed(() => {
        const map: Record<WidgetSize, string> = {
            small: 'col-span-1',
            medium: 'col-span-1 md:col-span-2',
            large: 'col-span-1 md:col-span-3',
            full: 'col-span-1 md:col-span-4',
        };
        return map[props.size];
    });

    const changePercent = computed(() => {
        if (!props.metric) return null;
        const {current, previous} = props.metric.summary;
        if (previous === 0) return null;
        return Math.round(((current - previous) / previous) * 100);
    });

    const formattedValue = computed(() => {
        if (!props.metric) return '—';
        const val = props.metric.summary.current;
        if (props.metric.unit === '%') return `${val.toFixed(1)}%`;
        if (props.metric.unit === 'hours') return `${val.toFixed(1)}h`;
        if (props.metric.unit === 'minutes') return `${val.toFixed(0)}m`;
        if (props.metric.unit === 'seconds') return `${val.toFixed(0)}s`;
        if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
        return val % 1 === 0 ? String(val) : val.toFixed(1);
    });

    const trendText = computed(() => {
        if (changePercent.value === null) return '';
        const arrow = props.metric?.summary.trend === 'up' ? '▲' : props.metric?.summary.trend === 'down' ? '▼' : '—';
        return `${arrow} ${Math.abs(changePercent.value)}%`;
    });

    const trendColor = computed(() => {
        if (!props.metric) return '#9ca3af';
        if (props.metric.summary.trend === 'up') return '#22c55e';
        if (props.metric.summary.trend === 'down') return '#ef4444';
        return '#9ca3af';
    });

    const HOUR_MS = 3_600_000;

    const dataInfo = computed(() => {
        const data = props.metric?.data;
        if (!data || data.length < 2) return {stepMs: 0};
        const stepMs = new Date(data[1].period).getTime() - new Date(data[0].period).getTime();
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

    function wrapText(text: string, maxLen = 50): string {
        const words = text.split(' ');
        let line = '';
        const lines: string[] = [];
        for (const word of words) {
            if (line && line.length + word.length + 1 > maxLen) {
                lines.push(line);
                line = word;
            } else {
                line = line ? `${line} ${word}` : word;
            }
        }
        if (line) lines.push(line);
        return lines.join('<br/>');
    }

    const chartOption = computed(() => {
        const data = props.metric?.data;
        const barColor = props.color ?? '#6366f1';

        const titles: Record<string, unknown>[] = [
            {
                text: props.title,
                left: 12,
                top: 8,
                textStyle: {fontSize: 14, fontWeight: 600, color: '#374151'},
            },
        ];

        if (props.metric) {
            titles.push({
                text: formattedValue.value,
                subtext: trendText.value,
                right: -formattedValue.value.length * 8.5,
                top: 8,
                textAlign: 'right' as const,
                textStyle: {fontSize: 22, fontWeight: 700, color: '#111827'},
                subtextStyle: {fontSize: 11, fontWeight: 500, color: trendColor.value},
            });
        }

        // Info icon + click-toggled description popup
        const graphic: Record<string, unknown>[] = [];
        if (props.description) {
            graphic.push({
                type: 'text',
                left: 12 + props.title.length * 8.5,
                top: 13,
                style: {
                    text: 'ⓘ',
                    fontSize: 16,
                    fill: '#666',
                    cursor: 'pointer',
                },
                tooltip: {
                    show: true,
                    formatter: wrapText(props.description),
                    confine: true,
                },
            });
        }

        if (!data?.length) {
            titles.push({
                text: 'No data available',
                left: 'center',
                bottom: 20,
                textStyle: {fontSize: 12, color: '#9ca3af', fontWeight: 400},
            });
            return {title: titles, graphic};
        }

        const {stepMs} = dataInfo.value;
        const labels = data.map((d) => formatPeriod(d.period, stepMs));
        const labelInterval = data.length <= 10 ? 0 : Math.max(0, Math.floor(data.length / 5) - 1);

        // Multi-series mode (grouped by repository)
        const seriesData = props.metric?.series;
        if (seriesData?.length) {
            const isPercentage = props.metric?.unit === '%';
            // For percentage metrics: line chart (stacking/side-by-side bars don't work well)
            // For additive metrics: stacked bars
            const echartsSeries = seriesData.map((s, i) => {
                const valueMap = new Map(s.data.map((d) => [d.period, d.value]));
                const color = SERIES_COLORS[i % SERIES_COLORS.length];
                if (isPercentage) {
                    return {
                        type: 'line' as const,
                        name: s.groupLabel,
                        data: data.map((d) => valueMap.get(d.period) ?? null),
                        lineStyle: {width: 2, color},
                        itemStyle: {color},
                        symbol: 'circle' as const,
                        symbolSize: 4,
                        connectNulls: false,
                    };
                }
                return {
                    type: 'bar' as const,
                    name: s.groupLabel,
                    stack: 'grouped',
                    data: data.map((d) => valueMap.get(d.period) ?? 0),
                    itemStyle: {
                        color,
                        borderRadius: [2, 2, 0, 0],
                    },
                    barMaxWidth: 16,
                };
            });

            return {
                title: titles,
                graphic,
                grid: {top: 64, right: 12, bottom: 24, left: 40},
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
                    axisLabel: {fontSize: 10, color: '#9ca3af'},
                    splitLine: {lineStyle: {color: '#e5e7eb', type: 'dashed' as const}},
                },
                series: echartsSeries,
            };
        }

        return {
            title: titles,
            graphic,
            grid: {top: 64, right: 12, bottom: 24, left: 40},
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
                axisLabel: {fontSize: 10, color: '#9ca3af'},
                splitLine: {lineStyle: {color: '#e5e7eb', type: 'dashed' as const}},
            },
            series: [
                {
                    type: 'bar' as const,
                    data: data.map((d) => d.value),
                    itemStyle: {color: barColor, borderRadius: [2, 2, 0, 0]},
                    barMaxWidth: 16,
                },
            ],
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
                autoresize
                style="height: 200px; width: 100%"
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
