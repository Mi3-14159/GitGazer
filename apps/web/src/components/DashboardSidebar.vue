<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import Textarea from '@/components/ui/Textarea.vue';
    import {useSidebarHover} from '@/composables/useSidebarHover';
    import {useDashboardsStore, type Dashboard} from '@/stores/dashboards';
    import {BarChart3, ChevronLeft, ChevronRight, LayoutDashboard, Pencil, Plus, Rocket, Trash2, Users} from 'lucide-vue-next';
    import {computed, ref} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const router = useRouter();
    const route = useRoute();
    const store = useDashboardsStore();
    const {expanded, requestExpand, requestCollapse} = useSidebarHover();

    const showCreateDialog = ref(false);
    const showRenameDialog = ref(false);
    const showDeleteDialog = ref(false);
    const editingDashboard = ref<Dashboard | null>(null);

    const newTitle = ref('');
    const newDescription = ref('');

    const currentId = computed(() => route.params.id as string);

    function iconForDashboard(d: Dashboard) {
        if (d.id === 'system-dora') return Rocket;
        if (d.id === 'system-space') return Users;
        return LayoutDashboard;
    }

    function navigateTo(d: Dashboard) {
        router.push({name: 'analytics-dashboard', params: {id: d.id}});
    }

    function openCreate() {
        newTitle.value = '';
        newDescription.value = '';
        showCreateDialog.value = true;
    }

    function handleCreate() {
        if (!newTitle.value.trim()) return;
        const created = store.createDashboard({title: newTitle.value.trim(), description: newDescription.value.trim(), icon: 'custom'});
        showCreateDialog.value = false;
        router.push({name: 'analytics-dashboard', params: {id: created.id}});
    }

    function openRename(d: Dashboard) {
        editingDashboard.value = d;
        newTitle.value = d.title;
        newDescription.value = d.description ?? '';
        showRenameDialog.value = true;
    }

    function handleRename() {
        if (!editingDashboard.value || !newTitle.value.trim()) return;
        store.updateDashboard(editingDashboard.value.id, {title: newTitle.value.trim(), description: newDescription.value.trim()});
        showRenameDialog.value = false;
    }

    function openDelete(d: Dashboard) {
        editingDashboard.value = d;
        showDeleteDialog.value = true;
    }

    function handleDelete() {
        if (!editingDashboard.value) return;
        const id = editingDashboard.value.id;
        store.deleteDashboard(id);
        showDeleteDialog.value = false;
        if (currentId.value === id) {
            router.push({name: 'analytics-dashboard', params: {id: 'system-dora'}});
        }
    }
</script>

<template>
    <aside
        :class="['flex flex-col border-r bg-card transition-all duration-300 overflow-hidden shrink-0', expanded ? 'w-60' : 'w-12']"
        @mouseenter="requestExpand"
        @mouseleave="requestCollapse"
    >
        <!-- Toggle -->
        <div class="flex items-center justify-between px-2 py-2 border-b">
            <span
                v-if="expanded"
                class="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1"
                >Dashboards</span
            >
            <button
                class="p-1 rounded hover:bg-muted transition-colors cursor-pointer"
                @click="expanded ? requestCollapse() : requestExpand()"
            >
                <ChevronRight
                    v-if="!expanded"
                    class="h-4 w-4 text-muted-foreground"
                />
                <ChevronLeft
                    v-else
                    class="h-4 w-4 text-muted-foreground"
                />
            </button>
        </div>

        <!-- System Dashboards -->
        <nav class="flex-1 overflow-y-auto py-1">
            <div
                v-if="expanded"
                class="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
            >
                System
            </div>
            <button
                v-for="d in store.systemDashboards"
                :key="d.id"
                :class="[
                    'flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors cursor-pointer',
                    currentId === d.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                ]"
                @click="navigateTo(d)"
            >
                <component
                    :is="iconForDashboard(d)"
                    class="h-4 w-4 shrink-0"
                />
                <span
                    v-if="expanded"
                    class="truncate"
                    >{{ d.title }}</span
                >
            </button>

            <!-- User Dashboards -->
            <template v-if="store.userDashboards.length > 0">
                <div
                    v-if="expanded"
                    class="px-3 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                >
                    Custom
                </div>
                <div
                    v-for="d in store.userDashboards"
                    :key="d.id"
                    class="group flex items-center"
                >
                    <button
                        :class="[
                            'flex items-center gap-2 flex-1 min-w-0 px-3 py-2 text-sm transition-colors cursor-pointer',
                            currentId === d.id
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        ]"
                        @click="navigateTo(d)"
                    >
                        <BarChart3 class="h-4 w-4 shrink-0" />
                        <span
                            v-if="expanded"
                            class="truncate"
                            >{{ d.title }}</span
                        >
                    </button>
                    <div
                        v-if="expanded"
                        class="opacity-0 group-hover:opacity-100 flex gap-0.5 pr-1 transition-opacity"
                    >
                        <button
                            class="p-1 rounded hover:bg-muted cursor-pointer"
                            @click.stop="openRename(d)"
                        >
                            <Pencil class="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button
                            class="p-1 rounded hover:bg-muted cursor-pointer"
                            @click.stop="openDelete(d)"
                        >
                            <Trash2 class="h-3 w-3 text-destructive" />
                        </button>
                    </div>
                </div>
            </template>
        </nav>

        <!-- Create button -->
        <div class="border-t p-2">
            <Button
                v-if="expanded"
                variant="outline"
                size="sm"
                class="w-full"
                @click="openCreate"
            >
                <Plus class="h-4 w-4" />
                New Dashboard
            </Button>
            <button
                v-else
                class="p-2 rounded hover:bg-muted w-full flex justify-center cursor-pointer"
                @click="openCreate"
            >
                <Plus class="h-4 w-4 text-muted-foreground" />
            </button>
        </div>

        <!-- Create Dialog -->
        <Dialog
            :open="showCreateDialog"
            @update:open="showCreateDialog = $event"
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold mb-4">New Dashboard</h3>
                <div class="space-y-3">
                    <div class="space-y-2">
                        <Label>Title</Label>
                        <Input
                            v-model="newTitle"
                            placeholder="Dashboard name"
                            @keydown.enter="handleCreate"
                        />
                    </div>
                    <div class="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                            v-model="newDescription"
                            placeholder="Optional description"
                        />
                    </div>
                </div>
                <div class="flex justify-end gap-2 mt-6">
                    <Button
                        variant="outline"
                        @click="close"
                        >Cancel</Button
                    >
                    <Button
                        @click="handleCreate"
                        :disabled="!newTitle.trim()"
                        >Create</Button
                    >
                </div>
            </template>
        </Dialog>

        <!-- Rename Dialog -->
        <Dialog
            :open="showRenameDialog"
            @update:open="showRenameDialog = $event"
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold mb-4">Rename Dashboard</h3>
                <div class="space-y-3">
                    <div class="space-y-2">
                        <Label>Title</Label>
                        <Input
                            v-model="newTitle"
                            placeholder="Dashboard name"
                            @keydown.enter="handleRename"
                        />
                    </div>
                    <div class="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                            v-model="newDescription"
                            placeholder="Optional description"
                        />
                    </div>
                </div>
                <div class="flex justify-end gap-2 mt-6">
                    <Button
                        variant="outline"
                        @click="close"
                        >Cancel</Button
                    >
                    <Button
                        @click="handleRename"
                        :disabled="!newTitle.trim()"
                        >Save</Button
                    >
                </div>
            </template>
        </Dialog>

        <!-- Delete Dialog -->
        <Dialog
            :open="showDeleteDialog"
            @update:open="showDeleteDialog = $event"
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold">Delete Dashboard</h3>
                <p class="mt-2 text-sm text-muted-foreground">
                    Delete "{{ editingDashboard?.title }}"? All custom widgets on this dashboard will be removed.
                </p>
                <div class="flex justify-end gap-2 mt-6">
                    <Button
                        variant="outline"
                        @click="close"
                        >Cancel</Button
                    >
                    <Button
                        variant="destructive"
                        @click="handleDelete"
                        >Delete</Button
                    >
                </div>
            </template>
        </Dialog>
    </aside>
</template>
