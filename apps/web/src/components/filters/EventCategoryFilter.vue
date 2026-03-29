<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {EVENT_LOG_CATEGORIES} from '@common/types';
    import {Layers} from 'lucide-vue-next';

    const selectedCategories = defineModel<string[]>({required: true});

    const categoryOptions = EVENT_LOG_CATEGORIES.map((c) => ({value: c, label: c.charAt(0).toUpperCase() + c.slice(1)}));
</script>

<template>
    <FilterDropdown
        v-model="selectedCategories"
        :options="categoryOptions"
        :icon="Layers"
        multiple
        placeholder="Category"
        search-placeholder="Search categories..."
        label="Category"
    />
</template>
