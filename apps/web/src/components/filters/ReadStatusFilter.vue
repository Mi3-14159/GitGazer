<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import type {EventLogReadFilter} from '@common/types';
    import {EVENT_LOG_READ_VALUES} from '@common/types';
    import {Eye} from 'lucide-vue-next';
    import {computed} from 'vue';

    const readStatus = defineModel<EventLogReadFilter>({required: true});

    const readOptions = EVENT_LOG_READ_VALUES.map((v) => ({
        value: v,
        label: v.charAt(0).toUpperCase() + v.slice(1),
    }));

    const readRef = computed({
        get: () => readStatus.value as string,
        set: (v: string) => {
            readStatus.value = v as EventLogReadFilter;
        },
    });
</script>

<template>
    <FilterDropdown
        v-model="readRef"
        :options="readOptions"
        :icon="Eye"
        width-class="sm:w-[130px]"
        label="Read status"
    />
</template>
