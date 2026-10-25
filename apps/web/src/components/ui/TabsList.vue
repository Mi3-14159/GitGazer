<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {TabsList} from 'radix-vue';
    import {type HTMLAttributes} from 'vue';

    const props = defineProps<{class?: HTMLAttributes['class']}>();
</script>

<template>
    <TabsList :class="cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', props.class)">
        <slot />
    </TabsList>
</template>
