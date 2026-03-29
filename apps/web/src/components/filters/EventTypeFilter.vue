<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import type {EventLogType} from '@common/types';
    import {EVENT_LOG_TYPES} from '@common/types';
    import {Filter} from 'lucide-vue-next';
    import {computed} from 'vue';

    const eventType = defineModel<EventLogType | 'all'>({required: true});

    const typeOptions = [
        {value: 'all', label: 'All Types'},
        ...EVENT_LOG_TYPES.map((t) => ({value: t, label: t.charAt(0).toUpperCase() + t.slice(1)})),
    ];

    const typeRef = computed({
        get: () => eventType.value as string,
        set: (v: string) => {
            eventType.value = v as EventLogType | 'all';
        },
    });
</script>

<template>
    <FilterDropdown
        v-model="typeRef"
        :options="typeOptions"
        :icon="Filter"
        width-class="sm:w-[150px]"
        label="Type"
    />
</template>
