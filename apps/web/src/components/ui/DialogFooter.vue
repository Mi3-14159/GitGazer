<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {type HTMLAttributes} from 'vue';

    const props = defineProps<{class?: HTMLAttributes['class']}>();
</script>

<template>
    <div :class="cn('flex justify-end gap-2 pt-4', props.class)"><slot /></div>
</template>
