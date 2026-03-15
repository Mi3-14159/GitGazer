<script setup lang="ts">
    import ColumnSelector from '@/components/workflows/ColumnSelector.vue';
    import ViewManager from '@/components/workflows/ViewManager.vue';
    import type {ColumnConfig, TableView} from '@/types/table';

    defineProps<{
        currentView: TableView;
        savedViews: TableView[];
    }>();

    const emit = defineEmits<{
        'view-change': [view: TableView];
        'save-view': [view: TableView];
        'delete-view': [id: string];
        'update:columns': [columns: ColumnConfig[]];
    }>();
</script>

<template>
    <div class="flex items-center justify-between shrink-0">
        <ViewManager
            :current-view="currentView"
            :saved-views="savedViews"
            @view-change="emit('view-change', $event)"
            @save-view="emit('save-view', $event)"
            @delete-view="emit('delete-view', $event)"
        />
        <ColumnSelector
            :columns="currentView.columns"
            @update:columns="emit('update:columns', $event)"
        />
    </div>
</template>
