<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Input from '@/components/ui/Input.vue';
    import Popover from '@/components/ui/Popover.vue';
    import {type WorkflowRunWithRelations} from '@common/types';
    import {Filter, Search} from 'lucide-vue-next';
    import {computed, ref} from 'vue';

    const props = defineProps<{
        columnId: string;
        columnLabel: string;
        workflows: WorkflowRunWithRelations[];
        activeValues: string[];
        getColumnValue: (workflow: WorkflowRunWithRelations, columnId: string) => string;
    }>();

    const emit = defineEmits<{
        filterChange: [values: string[]];
    }>();

    const open = ref(false);
    const searchTerm = ref('');

    interface FilterOption {
        value: string;
        count: number;
    }

    const filterOptions = computed<FilterOption[]>(() => {
        const valueCounts: Record<string, number> = {};
        for (const workflow of props.workflows) {
            const value = props.getColumnValue(workflow, props.columnId);
            valueCounts[value] = (valueCounts[value] || 0) + 1;
        }
        return Object.entries(valueCounts)
            .map(([value, count]) => ({value, count}))
            .sort((a, b) => b.count - a.count);
    });

    const filteredOptions = computed(() => {
        if (!searchTerm.value) return filterOptions.value;
        const term = searchTerm.value.toLowerCase();
        return filterOptions.value.filter((opt) => opt.value.toLowerCase().includes(term));
    });

    const hasActiveFilter = computed(() => props.activeValues.length > 0);

    function toggleValue(value: string) {
        const newValues = props.activeValues.includes(value) ? props.activeValues.filter((v) => v !== value) : [...props.activeValues, value];
        emit('filterChange', newValues);
    }

    function clearFilter() {
        emit('filterChange', []);
        searchTerm.value = '';
    }

    function selectAll() {
        emit(
            'filterChange',
            filteredOptions.value.map((opt) => opt.value),
        );
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

        <div class="flex flex-col max-h-[400px]">
            <div class="p-2 border-b sticky top-0 bg-card space-y-2">
                <div class="relative">
                    <Search class="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        v-model="searchTerm"
                        :placeholder="`Search ${columnLabel.toLowerCase()}...`"
                        class="pl-8 h-9"
                    />
                </div>
                <div class="flex gap-2">
                    <Button
                        v-if="hasActiveFilter"
                        variant="ghost"
                        size="sm"
                        class="flex-1 h-7 text-xs"
                        @click="clearFilter"
                    >
                        Clear
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        class="flex-1 h-7 text-xs"
                        @click="selectAll"
                    >
                        Select All
                    </Button>
                </div>
            </div>
            <div class="overflow-y-auto flex-1">
                <div
                    v-if="filteredOptions.length === 0"
                    class="p-4 text-sm text-center text-muted-foreground"
                >
                    No results found
                </div>
                <div
                    v-for="option in filteredOptions"
                    :key="option.value"
                    class="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                    @click="toggleValue(option.value)"
                >
                    <Checkbox :model-value="activeValues.includes(option.value)" />
                    <div class="flex-1 flex items-center justify-between gap-2">
                        <span class="text-sm truncate">{{ option.value }}</span>
                        <span class="text-xs text-muted-foreground">{{ option.count }}</span>
                    </div>
                </div>
            </div>
        </div>
    </Popover>
</template>
