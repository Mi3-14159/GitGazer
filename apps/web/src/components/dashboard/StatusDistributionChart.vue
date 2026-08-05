<script setup lang="ts">
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import type {OverviewResponse} from '@common/types';
    import {computed} from 'vue';

    const props = defineProps<{
        stats: OverviewResponse['stats'];
    }>();

    const RADIUS = 42;
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

    const segments = computed(() => {
        const total = props.stats.total || 1;
        let consumed = 0;
        return [
            {label: 'Success', value: props.stats.success, color: '#22c55e'},
            {label: 'Failed', value: props.stats.failure, color: '#ef4444'},
            {label: 'In Progress', value: props.stats.inProgress, color: '#3b82f6'},
            {label: 'Other', value: props.stats.other, color: '#94a3b8'},
        ].map(({label, value, color}) => {
            // `other` is derived by subtraction server-side and can go negative; a negative dash invalidates the whole arc.
            const safeValue = Math.max(0, value);
            const share = safeValue / total;
            const dash = share * CIRCUMFERENCE;
            const arc = {label, color, value: safeValue, share, dash, gap: CIRCUMFERENCE - dash, offset: -consumed * CIRCUMFERENCE};
            consumed += share;
            return arc;
        });
    });

    const successRate = computed(() => (props.stats.total > 0 ? ((props.stats.success / props.stats.total) * 100).toFixed(1) : '0.0'));
</script>

<template>
    <Card>
        <CardHeader>
            <CardTitle>Workflow Status Distribution</CardTitle>
            <CardDescription>Share of runs by outcome</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col items-center gap-6 sm:flex-row sm:items-center xl:flex-col">
            <div class="relative shrink-0">
                <svg
                    viewBox="0 0 100 100"
                    class="h-36 w-36 -rotate-90"
                    aria-hidden="true"
                >
                    <circle
                        cx="50"
                        cy="50"
                        :r="RADIUS"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="12"
                        class="text-muted"
                    />
                    <circle
                        v-for="segment in segments"
                        :key="segment.label"
                        cx="50"
                        cy="50"
                        :r="RADIUS"
                        fill="none"
                        :stroke="segment.color"
                        stroke-width="12"
                        :stroke-dasharray="`${segment.dash} ${segment.gap}`"
                        :stroke-dashoffset="segment.offset"
                    />
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-2xl font-semibold tabular-nums">{{ successRate }}%</span>
                    <span class="text-xs text-muted-foreground">success</span>
                </div>
            </div>
            <ul class="w-full min-w-0 space-y-2.5">
                <li
                    v-for="segment in segments"
                    :key="segment.label"
                    class="flex items-center gap-3 text-sm"
                >
                    <span
                        class="h-2.5 w-2.5 shrink-0 rounded-full"
                        :style="{backgroundColor: segment.color}"
                    />
                    <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ segment.label }}</span>
                    <span class="font-medium tabular-nums">{{ segment.value.toLocaleString('en-US') }}</span>
                    <span class="w-12 text-right text-xs text-muted-foreground tabular-nums">{{ (segment.share * 100).toFixed(1) }}%</span>
                </li>
            </ul>
        </CardContent>
    </Card>
</template>
