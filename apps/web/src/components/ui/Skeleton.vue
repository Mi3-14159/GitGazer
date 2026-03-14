<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {type HTMLAttributes} from 'vue';

    const props = defineProps<{class?: HTMLAttributes['class']}>();
</script>

<template>
    <div :class="cn('animate-pulse rounded-md bg-muted', props.class)" />
</template>
