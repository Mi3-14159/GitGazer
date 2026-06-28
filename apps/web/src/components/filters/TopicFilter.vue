<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {useMetrics} from '@/composables/useMetric';
    import type {FilterMode} from '@common/types';
    import {Tag} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';

    const selectedTopics = defineModel<string[]>({required: true});
    const mode = defineModel<FilterMode>('mode', {default: 'include'});

    defineProps<{excludable?: boolean}>();

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
        v-model:mode="mode"
        :options="options"
        :icon="Tag"
        multiple
        :excludable="excludable"
        placeholder="Topics"
        search-placeholder="Search topics..."
        label="Topics"
    />
</template>
