<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import {statusBadgeVariant, statusIcon} from '@/utils/status';
    import {computed} from 'vue';

    const props = withDefaults(
        defineProps<{
            status: string;
            size?: 'sm' | 'default';
        }>(),
        {size: 'default'},
    );

    const variant = computed(() => statusBadgeVariant(props.status || 'unknown'));
    const IconComponent = computed(() => statusIcon(props.status || 'unknown'));
    const label = computed(() => {
        const s = props.status || 'unknown';
        return s === 'in_progress' ? 'running' : s;
    });
</script>

<template>
    <Badge
        :variant="variant"
        :class="['gap-1', size === 'sm' ? 'h-5 text-xs px-1.5' : '']"
    >
        <component
            :is="IconComponent"
            class="h-3.5 w-3.5"
        />
        {{ label }}
    </Badge>
</template>
