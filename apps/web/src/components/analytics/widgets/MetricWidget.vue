<script setup lang="ts">
    import type { MetricResult } from '@common/types';
import { format, parseISO } from 'date-fns';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ArrowDown, ArrowUp, Minus } from 'lucide-vue-next';
import { computed } from 'vue';
import VChart from 'vue-echarts';

    use([CanvasRenderer, BarChart, GridComponent, TooltipComponent]);

    const props = defineProps<{
        metric: MetricResult | null;
        isLoading: boolean;
        color?: string;
    }>();

    const trendIcon = computed(() => {
        if (!props.metric) return Minus;
        if (props.metric.summary.trend === 'up') return ArrowUp;
        if (props.metric.summary.trend === 'down') return ArrowDown;
        return Minus;
    });

    const trendClass = computed(() => {
        if (!props.metric) return 'text-muted-foreground';
        if (props.metric.summary.trend === 'up') return 'text-green-600 dark:text-green-400';
        if (props.metric.summary.trend === 'down') return 'text-red-600 dark:text-red-400';
        return 'text-muted-foreground';
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

    const HOUR_MS = 3_600_000;

    /** Detect data step in ms for date format selection. */
    const dataInfo = computed(() => {
        const data = props.metric?.data;
        if (!data || data.length < 2) return {stepMs: 0};
        const stepMs = new Date(data[1].period).getTime() - new Date(data[0].period).getTime();
        return {stepMs};
    });

    /** Pick a date format string based on the time interval between data points. */
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

    const chartOption = computed(() => {
        const data = props.metric?.data;
        if (!data?.length) return null;

        const barColor = props.color ?? '#6366f1';
        const {stepMs} = dataInfo.value;
        const labels = data.map((d) => formatPeriod(d.period, stepMs));
        const labelInterval = data.length <= 10 ? 0 : Math.max(0, Math.floor(data.length / 5) - 1);

        return {
            grid: {top: 4, right: 4, bottom: 20, left: 36},
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
    <!-- Loading skeleton -->
    <div
        v-if="isLoading && !props.metric"
        class="space-y-3 animate-pulse"
    >
        <div class="flex items-center justify-between">
            <div>
                <div class="h-8 w-16 bg-muted rounded" />
                <div class="h-3 w-12 bg-muted rounded mt-1" />
            </div>
        </div>
        <div class="h-24 bg-muted rounded" />
    </div>

    <div
        v-else
        class="space-y-3"
    >
        <div class="flex items-center justify-between">
            <div>
                <div class="text-2xl font-bold">{{ formattedValue }}</div>
                <p class="text-xs text-muted-foreground">{{ props.metric?.unit ?? '' }}</p>
            </div>
            <div
                v-if="changePercent !== null"
                class="flex items-center gap-1"
                :class="trendClass"
            >
                <component
                    :is="trendIcon"
                    class="h-3 w-3"
                />
                <span class="text-xs font-medium">{{ Math.abs(changePercent) }}%</span>
            </div>
        </div>

        <!-- ECharts bar chart -->
        <VChart
            v-if="chartOption"
            :option="chartOption"
            autoresize
            style="height: 112px; width: 100%"
        />
        <div
            v-else
            class="flex items-center justify-center h-24 text-xs text-muted-foreground"
        >
            No data available
        </div>
    </div>
</template>
