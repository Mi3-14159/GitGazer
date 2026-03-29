<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {EVENT_LOG_TYPES} from '@common/types';
    import {Filter} from 'lucide-vue-next';

    const selectedTypes = defineModel<string[]>({required: true});

    const typeOptions = EVENT_LOG_TYPES.map((t) => ({value: t, label: t.charAt(0).toUpperCase() + t.slice(1)}));
</script>

<template>
    <FilterDropdown
        v-model="selectedTypes"
        :options="typeOptions"
        :icon="Filter"
        multiple
        placeholder="Type"
        search-placeholder="Search types..."
        label="Type"
    />
</template>
