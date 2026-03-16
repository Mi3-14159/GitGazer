<script setup lang="ts">
    import Card from '@/components/ui/Card.vue';
    import type {WidgetSize} from '@/types/analytics';
    import type {MetricResult} from '@common/types';
    import {format, parseISO} from 'date-fns';
    import {BarChart} from 'echarts/charts';
    import {GraphicComponent, GridComponent, TitleComponent, TooltipComponent} from 'echarts/components';
    import {use} from 'echarts/core';
    import {CanvasRenderer} from 'echarts/renderers';
    import {computed} from 'vue';
    import VChart from 'vue-echarts';

    use([CanvasRenderer, BarChart, GraphicComponent, GridComponent, TitleComponent, TooltipComponent]);

    const props = withDefaults(
        defineProps<{
            title: string;
            size: WidgetSize;
            metric: MetricResult | null;
            isLoading: boolean;
            color?: string;
            description?: string;
        }>(),
        {color: undefined, description: undefined},
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

        return {
            title: titles,
            graphic,
            grid: {top: 64, right: 12, bottom: 24, left: 40},
            tooltip: {trigger: 'axis' as const},
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
        <!-- Loading skeleton -->
        <div
            v-if="isLoading && !props.metric"
            class="p-4 space-y-3 animate-pulse"
        >
            <div class="flex items-center justify-between">
                <div>
                    <div class="h-4 w-32 bg-muted rounded" />
                    <div class="h-3 w-48 bg-muted rounded mt-1" />
                </div>
                <div class="h-6 w-16 bg-muted rounded" />
            </div>
            <div class="h-28 bg-muted rounded" />
        </div>
        <VChart
            v-else
            :option="chartOption"
            autoresize
            style="height: 200px; width: 100%"
        />
    </Card>
</template>
