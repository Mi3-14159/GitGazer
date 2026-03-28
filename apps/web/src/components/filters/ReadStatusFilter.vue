<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import type {EventLogReadFilter} from '@common/types';
    import {EVENT_LOG_READ_VALUES} from '@common/types';
    import {Eye} from 'lucide-vue-next';
    import {computed, inject, provide} from 'vue';

    const readStatus = defineModel<EventLogReadFilter>({default: 'unread'});

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

    const parentFilters = inject(FILTER_INJECTION_KEY, undefined);
    provide(FILTER_INJECTION_KEY, {...parentFilters, read: readRef});
</script>

<template>
    <FilterDropdown
        filter-key="read"
        :options="readOptions"
        :icon="Eye"
        width-class="sm:w-[130px]"
        label="Read status"
    />
</template>
