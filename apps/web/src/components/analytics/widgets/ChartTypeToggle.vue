<script setup lang="ts">
    import Tooltip from '@/components/ui/Tooltip.vue';
    import type {WidgetChartType} from '@/types/analytics';
    import {ChartArea, ChartBar, ChartBarStacked, ChartLine} from 'lucide-vue-next';
    import {computed, type Component} from 'vue';

    const props = defineProps<{
        modelValue: WidgetChartType;
        hasMultiSeries: boolean;
        disabled?: boolean;
    }>();

    const emit = defineEmits<{
        'update:modelValue': [value: WidgetChartType];
    }>();

    type ChartOption = {
        type: WidgetChartType;
        label: string;
        icon: Component;
    };

    const allOptions: ChartOption[] = [
        {type: 'bar', label: 'Bar', icon: ChartBar},
        {type: 'stacked-bar', label: 'Stacked Bar', icon: ChartBarStacked},
        {type: 'line', label: 'Line', icon: ChartLine},
        {type: 'area', label: 'Area', icon: ChartArea},
    ];

    const options = computed(() => {
        if (props.hasMultiSeries) return allOptions;
        // Single-series: no stacked-bar option
        return allOptions.filter((o) => o.type !== 'stacked-bar');
    });
</script>

<template>
    <div
        class="inline-flex items-center rounded-md border border-border/50 bg-muted/30 p-0.5 gap-0.5"
        role="radiogroup"
        aria-label="Chart type"
    >
        <Tooltip
            v-for="option in options"
            :key="option.type"
            :delay-duration="150"
            side="bottom"
        >
            <template #trigger>
                <button
                    role="radio"
                    :aria-checked="modelValue === option.type"
                    :aria-label="option.label"
                    :disabled="disabled"
                    class="inline-flex items-center justify-center rounded-sm p-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    :class="[
                        modelValue === option.type
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground/60 hover:text-muted-foreground',
                        disabled && 'pointer-events-none opacity-50',
                    ]"
                    @click="emit('update:modelValue', option.type)"
                >
                    <component
                        :is="option.icon"
                        class="h-3 w-3"
                    />
                </button>
            </template>
            {{ option.label }}
        </Tooltip>
    </div>
</template>
