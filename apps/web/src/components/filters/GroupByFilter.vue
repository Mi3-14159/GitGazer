<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import type {GroupByOption} from '@common/types';
    import {Layers} from 'lucide-vue-next';
    import {computed, inject, provide} from 'vue';

    const groupBy = defineModel<GroupByOption>({default: 'none'});

    const groupByOptions: {label: string; value: GroupByOption}[] = [
        {label: 'No grouping', value: 'none'},
        {label: 'Group by Repository', value: 'repository'},
        {label: 'Group by Topic', value: 'topic'},
    ];

    const groupByRef = computed({
        get: () => groupBy.value as string,
        set: (v: string) => {
            groupBy.value = v as GroupByOption;
        },
    });

    // Merge into existing injection or create a new one
    const parentFilters = inject(FILTER_INJECTION_KEY, undefined);
    provide(FILTER_INJECTION_KEY, {...parentFilters, groupBy: groupByRef});
</script>

<template>
    <FilterDropdown
        filter-key="groupBy"
        :options="groupByOptions"
        :icon="Layers"
        label="Group By"
    />
</template>
