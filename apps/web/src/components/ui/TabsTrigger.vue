<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {TabsTrigger} from 'radix-vue';
    import {type HTMLAttributes} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
        value: string;
    }>();
</script>

<template>
    <TabsTrigger
        :value="props.value"
        :class="
            cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer gap-2',
                'text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
                props.class,
            )
        "
    >
        <slot />
    </TabsTrigger>
</template>
