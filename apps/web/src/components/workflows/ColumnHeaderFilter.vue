<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Popover from '@/components/ui/Popover.vue';
    import type {CheckboxOption} from '@/components/ui/SearchableCheckboxList.vue';
    import SearchableCheckboxList from '@/components/ui/SearchableCheckboxList.vue';
    import {type WorkflowRunWithRelations} from '@common/types';
    import {Filter} from 'lucide-vue-next';
    import {computed, ref} from 'vue';

    const props = defineProps<{
        columnId: string;
        columnLabel: string;
        workflows: WorkflowRunWithRelations[];
        activeValues: string[];
        getColumnValue: (workflow: WorkflowRunWithRelations, columnId: string) => string;
        getColumnValues?: (workflow: WorkflowRunWithRelations, columnId: string) => string[];
    }>();

    const emit = defineEmits<{
        filterChange: [values: string[]];
    }>();

    const open = ref(false);

    const options = computed<CheckboxOption[]>(() => {
        const valueCounts: Record<string, number> = {};
        for (const workflow of props.workflows) {
            if (props.getColumnValues) {
                for (const value of props.getColumnValues(workflow, props.columnId)) {
                    valueCounts[value] = (valueCounts[value] || 0) + 1;
                }
            } else {
                const value = props.getColumnValue(workflow, props.columnId);
                valueCounts[value] = (valueCounts[value] || 0) + 1;
            }
        }
        return Object.entries(valueCounts)
            .filter(([value]) => value.length > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([value, count]) => ({value, label: value, count}));
    });

    const hasActiveFilter = computed(() => props.activeValues.length > 0);

    function toggleValue(value: string) {
        const newValues = props.activeValues.includes(value) ? props.activeValues.filter((v) => v !== value) : [...props.activeValues, value];
        emit('filterChange', newValues);
    }
</script>

<template>
    <Popover
        :open="open"
        align="start"
        content-class="w-64 p-0"
        @update:open="open = $event"
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
                :options="options"
                :selected="activeValues"
                :placeholder="`Search ${columnLabel.toLowerCase()}...`"
                @toggle="toggleValue"
                @clear="emit('filterChange', [])"
            />
        </div>
    </Popover>
</template>
