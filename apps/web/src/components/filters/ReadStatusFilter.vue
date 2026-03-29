<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {EVENT_LOG_READ_VALUES} from '@common/types';
    import {Eye} from 'lucide-vue-next';

    const selectedStatuses = defineModel<string[]>({required: true});

    const readOptions = EVENT_LOG_READ_VALUES.map((v) => ({value: v, label: v.charAt(0).toUpperCase() + v.slice(1)}));
</script>

<template>
    <FilterDropdown
        v-model="selectedStatuses"
        :options="readOptions"
        :icon="Eye"
        multiple
        placeholder="Read status"
        search-placeholder="Search..."
        label="Read status"
    />
</template>
