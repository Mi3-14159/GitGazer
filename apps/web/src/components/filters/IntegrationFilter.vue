<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {useIntegration} from '@/composables/useIntegration';
    import type {Integration} from '@common/types';
    import {Blocks} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';

    const selectedIds = defineModel<string[]>({required: true});

    const {getIntegrations} = useIntegration();
    const integrations = ref<Integration[]>([]);

    onMounted(async () => {
        try {
            integrations.value = (await getIntegrations()) ?? [];
        } catch (err) {
            console.warn('Failed to load integrations for filter', err);
        }
    });

    const options = computed(() => integrations.value.map((i) => ({value: i.integrationId, label: i.label})));
</script>

<template>
    <FilterDropdown
        v-model="selectedIds"
        :options="options"
        :icon="Blocks"
        multiple
        placeholder="Integrations"
        search-placeholder="Search integrations..."
        label="Integrations"
    />
</template>
