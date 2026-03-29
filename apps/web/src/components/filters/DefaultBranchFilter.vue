<script setup lang="ts">
    import FilterBoolean from '@/components/ui/FilterBoolean.vue';
    import {GitBranch} from 'lucide-vue-next';

    const model = defineModel<boolean>({required: true});
</script>

<template>
    <FilterBoolean
        v-model="model"
        label="Default branch only"
        :icon="GitBranch"
    />
</template>
