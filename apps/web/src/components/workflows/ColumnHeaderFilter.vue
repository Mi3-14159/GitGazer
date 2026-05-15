<script setup lang="ts">
    import type {DateRange} from '@/components/filters/DateTimeRangePicker.vue';
    import Button from '@/components/ui/Button.vue';
    import Popover from '@/components/ui/Popover.vue';
    import SearchableCheckboxList from '@/components/ui/SearchableCheckboxList.vue';
    import {useFilterValues} from '@/composables/useFilterValues';
    import {Filter} from 'lucide-vue-next';
    import {computed, onUnmounted, ref, toRef} from 'vue';

    const props = defineProps<{
        columnId: string;
        columnLabel: string;
        activeValues: string[];
        dateRange: DateRange;
    }>();

    const emit = defineEmits<{
        filterChange: [values: string[]];
    }>();

    const {options, isLoading, searchTerm, open: fetchOnOpen, cleanup} = useFilterValues(props.columnId, toRef(props, 'dateRange'));

    const isOpen = ref(false);

    function handleOpenChange(val: boolean) {
        isOpen.value = val;
        if (val) {
            searchTerm.value = '';
            fetchOnOpen();
        }
    }

    const hasActiveFilter = computed(() => props.activeValues.length > 0);

    function toggleValue(value: string) {
        const newValues = props.activeValues.includes(value) ? props.activeValues.filter((v) => v !== value) : [...props.activeValues, value];
        emit('filterChange', newValues);
    }

    onUnmounted(cleanup);
</script>

<template>
    <Popover
        :open="isOpen"
        align="start"
        content-class="w-64 p-0"
        @update:open="handleOpenChange"
    >
        <template #trigger>
            <Button
                variant="ghost"
                size="sm"
                :class="['h-6 px-1 hover:bg-muted', hasActiveFilter ? 'text-primary' : 'text-muted-foreground']"
            >
                <Filter :class="['h-3.5 w-3.5', hasActiveFilter ? 'fill-primary' : '']" />
            </Button>
        </template>

        <div class="p-2">
            <SearchableCheckboxList
                v-model:search-term="searchTerm"
                :options="options"
                :selected="activeValues"
                :loading="isLoading"
                :placeholder="`Search ${columnLabel.toLowerCase()}...`"
                @toggle="toggleValue"
                @clear="emit('filterChange', [])"
            />
        </div>
    </Popover>
</template>
