<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {TabsContent} from 'radix-vue';
    import {type HTMLAttributes} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
        value: string;
    }>();
</script>

<template>
    <TabsContent
        :value="props.value"
        :class="cn('mt-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', props.class)"
    >
        <slot />
    </TabsContent>
</template>
