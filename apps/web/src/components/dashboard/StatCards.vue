<script setup lang="ts">
    import Card from '@/components/ui/Card.vue';
    import type {OverviewResponse} from '@common/types';
    import {Activity, CheckCircle2, Clock, XCircle} from 'lucide-vue-next';
    import {computed} from 'vue';

    const props = defineProps<{
        stats: OverviewResponse['stats'];
        successRate: string;
    }>();

    const share = (value: number) => (props.stats.total > 0 ? (Math.max(0, value) / props.stats.total) * 100 : 0);

    const cards = computed(() => [
        {
            label: 'Total Workflows',
            value: props.stats.total,
            caption: 'Active pipelines',
            icon: Activity,
            accent: 'bg-foreground/30',
            chip: 'bg-muted text-foreground',
            bar: [
                {color: 'bg-green-500', width: share(props.stats.success)},
                {color: 'bg-red-500', width: share(props.stats.failure)},
                {color: 'bg-blue-500', width: share(props.stats.inProgress)},
                {color: 'bg-slate-400', width: share(props.stats.other)},
            ],
        },
        {
            label: 'Successful Runs',
            value: props.stats.success,
            caption: `${props.successRate}% success rate`,
            icon: CheckCircle2,
            accent: 'bg-green-500',
            chip: 'bg-green-500/10 text-green-600 dark:text-green-400',
            bar: [{color: 'bg-green-500', width: share(props.stats.success)}],
        },
        {
            label: 'Failed Runs',
            value: props.stats.failure,
            caption: props.stats.failure > 0 ? 'Requires attention' : 'All clear',
            icon: XCircle,
            accent: 'bg-red-500',
            chip: 'bg-red-500/10 text-red-600 dark:text-red-400',
            bar: [{color: 'bg-red-500', width: share(props.stats.failure)}],
        },
        {
            label: 'In Progress',
            value: props.stats.inProgress,
            caption: 'Currently running',
            icon: Clock,
            accent: 'bg-blue-500',
            chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            bar: [{color: 'bg-blue-500', width: share(props.stats.inProgress)}],
        },
    ]);
</script>

<template>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
            v-for="card in cards"
            :key="card.label"
            class="relative overflow-hidden transition-shadow hover:shadow-md"
        >
            <span
                class="absolute inset-x-0 top-0 h-1"
                :class="card.accent"
            />
            <div class="flex items-start justify-between gap-3 p-5 pb-3">
                <span class="text-sm font-medium text-muted-foreground">{{ card.label }}</span>
                <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    :class="card.chip"
                >
                    <component
                        :is="card.icon"
                        class="h-4 w-4"
                    />
                </span>
            </div>
            <div class="px-5 pb-5">
                <div class="text-3xl font-semibold tracking-tight tabular-nums">{{ card.value.toLocaleString('en-US') }}</div>
                <p class="mt-1 text-xs text-muted-foreground">{{ card.caption }}</p>
                <div class="mt-3 flex h-1 gap-px overflow-hidden rounded-full bg-muted">
                    <div
                        v-for="(segment, index) in card.bar"
                        :key="index"
                        class="h-full transition-[width] duration-500"
                        :class="segment.color"
                        :style="{width: `${segment.width}%`}"
                    />
                </div>
            </div>
        </Card>
    </div>
</template>
