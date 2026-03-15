<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {type HTMLAttributes} from 'vue';

    const props = defineProps<{class?: HTMLAttributes['class']}>();
</script>

<template>
    <div
        :class="cn('h-[1px] w-full bg-border', props.class)"
        role="separator"
    />
</template>
