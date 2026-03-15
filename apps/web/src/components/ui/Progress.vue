<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {type HTMLAttributes, computed} from 'vue';

    const props = withDefaults(
        defineProps<{
            class?: HTMLAttributes['class'];
            value?: number;
            max?: number;
        }>(),
        {value: 0, max: 100},
    );

    const percentage = computed(() => Math.min(100, Math.max(0, (props.value / props.max) * 100)));
</script>

<template>
    <div :class="cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', props.class)">
        <div
            class="h-full bg-primary transition-all"
            :style="{width: `${percentage}%`}"
        />
    </div>
</template>
