<script setup lang="ts">
    import FilterBoolean from '@/components/ui/FilterBoolean.vue';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import {GitBranch} from 'lucide-vue-next';
    import {inject, provide} from 'vue';

    const modelValue = defineModel<boolean>({default: false});

    const parentFilters = inject(FILTER_INJECTION_KEY, undefined);
    provide(FILTER_INJECTION_KEY, {...parentFilters, defaultBranchOnly: modelValue});
</script>

<template>
    <FilterBoolean
        filter-key="defaultBranchOnly"
        label="Default branch only"
        :icon="GitBranch"
    />
</template>
