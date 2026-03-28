<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import type {EventLogCategory} from '@common/types';
    import {EVENT_LOG_CATEGORIES} from '@common/types';
    import {Layers} from 'lucide-vue-next';
    import {computed, inject, provide} from 'vue';

    const category = defineModel<EventLogCategory | 'all'>({default: 'all'});

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

    const parentFilters = inject(FILTER_INJECTION_KEY, undefined);
    provide(FILTER_INJECTION_KEY, {...parentFilters, category: categoryRef});
</script>

<template>
    <FilterDropdown
        filter-key="category"
        :options="categoryOptions"
        :icon="Layers"
        width-class="sm:w-[170px]"
        label="Category"
    />
</template>
