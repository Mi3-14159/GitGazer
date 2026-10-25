<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {TabsRoot} from 'radix-vue';
    import {type HTMLAttributes} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
        modelValue?: string;
        defaultValue?: string;
    }>();

    const emit = defineEmits<{
        'update:modelValue': [value: string];
    }>();
</script>

<template>
    <TabsRoot
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :class="cn('', props.class)"
        @update:model-value="emit('update:modelValue', String($event))"
    >
        <slot />
    </TabsRoot>
</template>
