<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {EVENT_LOG_CATEGORIES, type FilterMode} from '@common/types';
    import {Layers} from 'lucide-vue-next';

    const selectedCategories = defineModel<string[]>({required: true});
    const mode = defineModel<FilterMode>('mode', {default: 'include'});

    defineProps<{excludable?: boolean}>();

    const categoryOptions = EVENT_LOG_CATEGORIES.map((c) => ({value: c, label: c.charAt(0).toUpperCase() + c.slice(1)}));
</script>

<template>
    <FilterDropdown
        v-model="selectedCategories"
        v-model:mode="mode"
        :options="categoryOptions"
        :icon="Layers"
        multiple
        :excludable="excludable"
        placeholder="Category"
        search-placeholder="Search categories..."
        label="Category"
    />
</template>
