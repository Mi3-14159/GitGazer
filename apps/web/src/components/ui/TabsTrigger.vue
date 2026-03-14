<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {computed, type HTMLAttributes, inject, type Ref} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
        value: string;
    }>();

    const activeTab = inject<Ref<string>>('tabs-active');
    const setActiveTab = inject<(value: string) => void>('tabs-set');

    const isActive = computed(() => activeTab?.value === props.value);
</script>

<template>
    <button
        type="button"
        :class="
            cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer gap-2',
                isActive ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                props.class,
            )
        "
        @click="setActiveTab?.(props.value)"
    >
        <slot />
    </button>
</template>
