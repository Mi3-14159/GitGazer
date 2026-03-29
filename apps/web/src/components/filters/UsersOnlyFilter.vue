<script setup lang="ts">
    import FilterBoolean from '@/components/ui/FilterBoolean.vue';
    import {User} from 'lucide-vue-next';

    const model = defineModel<boolean>({required: true});
</script>

<template>
    <FilterBoolean
        v-model="model"
        label="Users only"
        :icon="User"
    />
</template>
