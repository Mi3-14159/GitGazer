<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import type {GroupByOption} from '@common/types';
    import {Layers} from 'lucide-vue-next';
    import {computed} from 'vue';

    const groupBy = defineModel<GroupByOption>({required: true});

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
</script>

<template>
    <FilterDropdown
        v-model="groupByRef"
        :options="groupByOptions"
        :icon="Layers"
        label="Group By"
    />
</template>
