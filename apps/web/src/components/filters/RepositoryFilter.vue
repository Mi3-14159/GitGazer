<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {useMetrics} from '@/composables/useMetric';
    import {GitFork} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';

    const selectedIds = defineModel<number[]>({required: true});

    const {fetchRepositories} = useMetrics();
    const repositories = ref<{id: number; name: string}[]>([]);

    onMounted(async () => {
        try {
            repositories.value = await fetchRepositories();
        } catch (err) {
            console.warn('Failed to load repositories for filter', err);
        }
    });

    const options = computed(() => repositories.value.map((r) => ({value: String(r.id), label: r.name})));

    const stringsRef = computed({
        get: () => selectedIds.value.map(String),
        set: (v: string[]) => {
            selectedIds.value = v.map(Number);
        },
    });
</script>

<template>
    <FilterDropdown
        v-model="stringsRef"
        :options="options"
        :icon="GitFork"
        multiple
        placeholder="Repositories"
        search-placeholder="Search repositories..."
        label="Repositories"
    />
</template>
