<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {type HTMLAttributes, provide, ref} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
        modelValue?: string;
        defaultValue?: string;
    }>();

    const emit = defineEmits<{
        'update:modelValue': [value: string];
    }>();

    const activeTab = ref(props.modelValue ?? props.defaultValue ?? '');

    function setActiveTab(value: string) {
        activeTab.value = value;
        emit('update:modelValue', value);
    }

    // Watch for external changes
    import {watch} from 'vue';
    watch(
        () => props.modelValue,
        (val) => {
            if (val !== undefined) activeTab.value = val;
        },
    );

    provide('tabs-active', activeTab);
    provide('tabs-set', setActiveTab);
</script>

<template>
    <div :class="cn('', props.class)"><slot /></div>
</template>
