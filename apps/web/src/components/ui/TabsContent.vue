<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {computed, type HTMLAttributes, inject, type Ref} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
        value: string;
    }>();

    const activeTab = inject<Ref<string>>('tabs-active');
    const isActive = computed(() => activeTab?.value === props.value);
</script>

<template>
    <div
        v-if="isActive"
        :class="cn('mt-2', props.class)"
    >
        <slot />
    </div>
</template>
