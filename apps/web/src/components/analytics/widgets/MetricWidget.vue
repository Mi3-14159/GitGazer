<script setup lang="ts">
    import type {MetricResult} from '@common/types';
    import {format, parseISO} from 'date-fns';
    import {ArrowDown, ArrowUp, Minus} from 'lucide-vue-next';
    import {computed} from 'vue';

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

    const maxDataValue = computed(() => {
        if (!props.metric?.data?.length) return 1;
        return Math.max(...props.metric.data.map((d) => d.value), 1);
    });

    /** Detect granularity from data density and format period labels accordingly. */
    const dateFormat = computed(() => {
        const data = props.metric?.data;
        if (!data || data.length < 2) return 'MMM d';
        const first = parseISO(data[0].period).getTime();
        const second = parseISO(data[1].period).getTime();
        const diffHours = (second - first) / (1000 * 60 * 60);
        if (diffHours <= 1) return 'MMM d, HH:mm';
        if (diffHours <= 24) return 'MMM d';
        if (diffHours <= 24 * 7) return 'MMM d';
        return 'MMM yyyy';
    });

    function formatPeriod(period: string): string {
        try {
            return format(parseISO(period), dateFormat.value);
        } catch {
            return period;
        }
    }

    /** Pick evenly-spaced tick indices including first and last. */
    const tickIndices = computed(() => {
        const data = props.metric?.data;
        if (!data || data.length === 0) return [];
        const len = data.length;
        if (len <= 5) return data.map((_, i) => i);
        const tickCount = 5;
        const indices: number[] = [0];
        const step = (len - 1) / (tickCount - 1);
        for (let t = 1; t < tickCount - 1; t++) {
            indices.push(Math.round(step * t));
        }
        indices.push(len - 1);
        return indices;
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
        <div class="h-20 bg-muted rounded" />
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

        <!-- Mini bar chart -->
        <div
            v-if="props.metric?.data?.length"
            class="flex items-end gap-px h-20"
        >
            <div
                v-for="(point, i) in props.metric.data"
                :key="i"
                class="flex-1 rounded-t transition-all"
                :class="color ?? 'bg-primary'"
                :style="{height: `${Math.max(4, (point.value / maxDataValue) * 100)}%`}"
                :title="`${point.period}: ${point.value}`"
            />
        </div>
        <div
            v-else
            class="flex items-center justify-center h-20 text-xs text-muted-foreground"
        >
            No data available
        </div>

        <!-- Period labels -->
        <div
            v-if="props.metric?.data?.length"
            class="relative h-4 text-[10px] text-muted-foreground"
        >
            <span
                v-for="idx in tickIndices"
                :key="idx"
                class="absolute -translate-x-1/2 whitespace-nowrap"
                :class="{
                    '!translate-x-0': idx === 0,
                    '!-translate-x-full': idx === props.metric!.data.length - 1,
                }"
                :style="{left: `${(idx / (props.metric!.data.length - 1)) * 100}%`}"
            >
                {{ formatPeriod(props.metric!.data[idx].period) }}
            </span>
        </div>
    </div>
</template>
