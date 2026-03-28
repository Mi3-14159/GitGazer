<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import {useMetrics} from '@/composables/useMetric';
    import {Tag} from 'lucide-vue-next';
    import {computed, inject, onMounted, provide, ref} from 'vue';

    const selectedTopics = defineModel<string[]>({default: () => []});

    const {fetchTopics} = useMetrics();
    const availableTopics = ref<string[]>([]);

    onMounted(async () => {
        try {
            availableTopics.value = await fetchTopics();
        } catch {
            // silently fail — list stays empty
        }
    });

    const options = computed(() => availableTopics.value.map((t) => ({value: t, label: t})));

    // Merge into existing injection or create a new one
    const parentFilters = inject(FILTER_INJECTION_KEY, undefined);
    provide(FILTER_INJECTION_KEY, {...parentFilters, topics: selectedTopics});
</script>

<template>
    <FilterDropdown
        filter-key="topics"
        :options="options"
        :icon="Tag"
        multiple
        placeholder="Topics"
        search-placeholder="Search topics..."
        label="Topics"
    />
</template>
