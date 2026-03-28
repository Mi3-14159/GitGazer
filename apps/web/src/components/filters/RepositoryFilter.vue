<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import {useMetrics} from '@/composables/useMetric';
    import {GitFork} from 'lucide-vue-next';
    import {computed, inject, onMounted, provide, ref} from 'vue';

    const selectedIds = defineModel<number[]>({default: () => []});

    const {fetchRepositories} = useMetrics();
    const repositories = ref<{id: number; name: string}[]>([]);

    onMounted(async () => {
        try {
            repositories.value = await fetchRepositories();
        } catch {
            // silently fail — list stays empty
        }
    });

    const options = computed(() => repositories.value.map((r) => ({value: String(r.id), label: r.name})));

    const stringsRef = computed({
        get: () => selectedIds.value.map(String),
        set: (v: string[]) => {
            selectedIds.value = v.map(Number);
        },
    });

    // Merge into existing injection or create a new one
    const parentFilters = inject(FILTER_INJECTION_KEY, undefined);
    provide(FILTER_INJECTION_KEY, {...parentFilters, repositoryIds: stringsRef});
</script>

<template>
    <FilterDropdown
        filter-key="repositoryIds"
        :options="options"
        :icon="GitFork"
        multiple
        placeholder="Repositories"
        search-placeholder="Search repositories..."
        label="Repositories"
    />
</template>
