<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {useMetrics} from '@/composables/useMetric';
    import {Tag} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';

    const selectedTopics = defineModel<string[]>({required: true});

    const {fetchTopics} = useMetrics();
    const availableTopics = ref<string[]>([]);

    onMounted(async () => {
        try {
            availableTopics.value = await fetchTopics();
        } catch (err) {
            console.warn('Failed to load topics for filter', err);
        }
    });

    const options = computed(() => availableTopics.value.map((t) => ({value: t, label: t})));
</script>

<template>
    <FilterDropdown
        v-model="selectedTopics"
        :options="options"
        :icon="Tag"
        multiple
        placeholder="Topics"
        search-placeholder="Search topics..."
        label="Topics"
    />
</template>
