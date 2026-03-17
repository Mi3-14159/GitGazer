<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import type {Granularity} from '@common/types';
    import {computed, type HTMLAttributes} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
    }>();

    const granularity = defineModel<Granularity>('granularity', {default: 'day'});

    const options: {label: string; value: Granularity}[] = [
        {label: 'Hour', value: 'hour'},
        {label: 'Day', value: 'day'},
        {label: 'Week', value: 'week'},
        {label: 'Month', value: 'month'},
    ];

    const selected = computed(() => granularity.value);

    function select(value: Granularity) {
        granularity.value = value;
    }
</script>

<template>
    <div
        :class="cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', props.class)"
        role="radiogroup"
        aria-label="Granularity"
    >
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="selected === option.value"
            :class="
                cn(
                    'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                    selected === option.value ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                )
            "
            @click="select(option.value)"
        >
            {{ option.label }}
        </button>
    </div>
</template>
