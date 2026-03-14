<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import DialogDescription from '@/components/ui/DialogDescription.vue';
    import DialogFooter from '@/components/ui/DialogFooter.vue';
    import DialogHeader from '@/components/ui/DialogHeader.vue';
    import DialogTitle from '@/components/ui/DialogTitle.vue';
    import Input from '@/components/ui/Input.vue';
    import Popover from '@/components/ui/Popover.vue';
    import {type TableView} from '@/types/table';
    import {Check, Eye, Plus, Save, Trash2} from 'lucide-vue-next';
    import {ref} from 'vue';

    const props = defineProps<{
        currentView: TableView;
        savedViews: TableView[];
    }>();

    const emit = defineEmits<{
        viewChange: [view: TableView];
        saveView: [view: TableView];
        deleteView: [viewId: string];
    }>();

    const showViewManager = ref(false);
    const showSaveDialog = ref(false);
    const viewName = ref('');
    const isEditing = ref(false);

    function handleSaveView() {
        if (!viewName.value.trim()) return;

        const newView: TableView = {
            ...props.currentView,
            id: isEditing.value ? props.currentView.id : `view-${Date.now()}`,
            name: viewName.value,
            isDefault: false,
        };

        emit('saveView', newView);
        showSaveDialog.value = false;
        viewName.value = '';
        isEditing.value = false;
    }

    function openSaveDialog(editing = false) {
        showViewManager.value = false;
        isEditing.value = editing;
        viewName.value = editing ? props.currentView.name : '';
        showSaveDialog.value = true;
    }

    function selectView(view: TableView) {
        emit('viewChange', view);
        showViewManager.value = false;
    }

    function handleDelete(viewId: string) {
        emit('deleteView', viewId);
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') handleSaveView();
    }
</script>

<template>
    <div class="flex items-center gap-2">
        <Popover
            :open="showViewManager"
            align="start"
            @update:open="showViewManager = $event"
        >
            <template #trigger>
                <Button
                    variant="outline"
                    size="sm"
                    class="gap-2"
                >
                    <Eye class="h-4 w-4" />
                    {{ currentView.name }}
                </Button>
            </template>

            <p class="font-semibold text-sm mb-3">Saved Views</p>

            <div class="space-y-1">
                <button
                    v-for="view in savedViews"
                    :key="view.id"
                    class="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    :class="view.id === currentView.id ? 'bg-accent/50' : ''"
                    @click="selectView(view)"
                >
                    <span class="font-medium">{{ view.name }}</span>
                    <div class="flex items-center gap-2">
                        <Check
                            v-if="view.id === currentView.id"
                            class="h-4 w-4 text-primary"
                        />
                        <button
                            v-if="!view.isDefault"
                            class="p-1 hover:bg-destructive/10 rounded"
                            @click.stop="handleDelete(view.id)"
                        >
                            <Trash2 class="h-3 w-3 text-destructive" />
                        </button>
                    </div>
                </button>
            </div>

            <button
                class="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground mt-1"
                @click="openSaveDialog(false)"
            >
                <Plus class="h-4 w-4" />
                Save as new view
            </button>
        </Popover>

        <Button
            variant="outline"
            size="sm"
            :disabled="currentView.isDefault"
            class="gap-2"
            @click="openSaveDialog(true)"
        >
            <Save class="h-4 w-4" />
            {{ currentView.isDefault ? 'Default View' : 'Update View' }}
        </Button>
    </div>

    <!-- Save/Update dialog (kept as modal since it requires input) -->
    <Dialog
        :open="showSaveDialog"
        @update:open="showSaveDialog = $event"
    >
        <template #default="{close}">
            <DialogHeader>
                <DialogTitle>{{ isEditing ? 'Update View' : 'Save New View' }}</DialogTitle>
                <DialogDescription>
                    {{
                        isEditing ? 'Update the current view with your changes.' : 'Save your current column and filter configuration as a new view.'
                    }}
                </DialogDescription>
            </DialogHeader>
            <div class="py-4">
                <Input
                    v-model="viewName"
                    placeholder="View name (e.g., My Failed Workflows)"
                    autofocus
                    @keydown="onKeydown"
                />
            </div>
            <DialogFooter>
                <Button
                    variant="outline"
                    @click="close()"
                >
                    Cancel
                </Button>
                <Button
                    :disabled="!viewName.trim()"
                    @click="handleSaveView"
                >
                    {{ isEditing ? 'Update' : 'Save' }} View
                </Button>
            </DialogFooter>
        </template>
    </Dialog>
</template>
