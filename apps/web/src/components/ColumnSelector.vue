<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Popover from '@/components/ui/Popover.vue';
    import {type ColumnConfig} from '@/types/table';
    import {Check, Columns3} from 'lucide-vue-next';
    import {computed, ref} from 'vue';

    const props = defineProps<{
        columns: ColumnConfig[];
    }>();

    const emit = defineEmits<{
        'update:columns': [columns: ColumnConfig[]];
    }>();

    const showPopover = ref(false);
    const visibleCount = computed(() => props.columns.filter((c) => c.visible).length);

    function toggleColumn(columnId: string) {
        const updated = props.columns.map((col) => (col.id === columnId ? {...col, visible: !col.visible} : col));
        emit('update:columns', updated);
    }
</script>

<template>
    <Popover
        :open="showPopover"
        align="end"
        @update:open="showPopover = $event"
    >
        <template #trigger>
            <Button
                variant="outline"
                size="sm"
                class="gap-2"
            >
                <Columns3 class="h-4 w-4" />
                Columns ({{ visibleCount }})
            </Button>
        </template>

        <p class="font-semibold text-sm mb-3">Show/Hide Columns</p>

        <div class="space-y-1">
            <button
                v-for="column in columns"
                :key="column.id"
                class="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent cursor-pointer"
                @click="toggleColumn(column.id)"
            >
                <span class="font-medium">{{ column.label }}</span>
                <Check
                    v-if="column.visible"
                    class="h-4 w-4 text-primary"
                />
            </button>
        </div>
    </Popover>
</template>
