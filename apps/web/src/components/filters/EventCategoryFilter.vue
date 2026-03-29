<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import type {EventLogCategory} from '@common/types';
    import {EVENT_LOG_CATEGORIES} from '@common/types';
    import {Layers} from 'lucide-vue-next';
    import {computed} from 'vue';

    const category = defineModel<EventLogCategory | 'all'>({required: true});

    const categoryOptions = [
        {value: 'all', label: 'All Categories'},
        ...EVENT_LOG_CATEGORIES.map((c) => ({value: c, label: c.charAt(0).toUpperCase() + c.slice(1)})),
    ];

    const categoryRef = computed({
        get: () => category.value as string,
        set: (v: string) => {
            category.value = v as EventLogCategory | 'all';
        },
    });
</script>

<template>
    <FilterDropdown
        v-model="categoryRef"
        :options="categoryOptions"
        :icon="Layers"
        width-class="sm:w-[170px]"
        label="Category"
    />
</template>
