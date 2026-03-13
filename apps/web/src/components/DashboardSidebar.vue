<script setup lang="ts">
    import {useSidebarHover} from '@/composables/useSidebarHover';
    import {useDashboardsStore} from '@/stores/dashboards';
    import {computed, ref} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const store = useDashboardsStore();
    const router = useRouter();
    const route = useRoute();
    const {expanded, requestExpand, requestCollapse} = useSidebarHover();

    const activeDashboardId = computed(() => (route.params.id as string) || 'system-dora');

    const renamingId = ref<string | null>(null);
    const renameValue = ref('');
    const deleteConfirmId = ref<string | null>(null);

    function selectDashboard(id: string) {
        router.push({name: 'analytics-dashboard', params: {id}});
    }

    function startRename(dashboard: {id: string; title: string}) {
        renamingId.value = dashboard.id;
        renameValue.value = dashboard.title;
    }

    function confirmRename() {
        if (renamingId.value && renameValue.value.trim()) {
            store.updateDashboard(renamingId.value, {title: renameValue.value.trim()});
        }
        renamingId.value = null;
    }

    function confirmDelete(id: string) {
        deleteConfirmId.value = id;
    }

    function executeDelete() {
        if (!deleteConfirmId.value) return;
        const wasActive = activeDashboardId.value === deleteConfirmId.value;
        store.deleteDashboard(deleteConfirmId.value);
        deleteConfirmId.value = null;
        if (wasActive) {
            router.push({name: 'analytics-dashboard', params: {id: 'system-dora'}});
        }
    }

    // Create dashboard dialog
    const showDeleteDialog = computed({
        get: () => deleteConfirmId.value !== null,
        set: (val: boolean) => {
            if (!val) deleteConfirmId.value = null;
        },
    });

    // Create dashboard dialog
    const showCreateDialog = ref(false);
    const newTitle = ref('');
    const newDescription = ref('');
    const newIcon = ref('mdi-chart-box-plus-outline');

    const iconOptions = [
        'mdi-chart-box-plus-outline',
        'mdi-chart-timeline-variant',
        'mdi-chart-bar',
        'mdi-chart-areaspline',
        'mdi-speedometer',
        'mdi-target',
        'mdi-fire',
        'mdi-bug',
    ];

    function openCreateDialog() {
        newTitle.value = '';
        newDescription.value = '';
        newIcon.value = 'mdi-chart-box-plus-outline';
        showCreateDialog.value = true;
    }

    function createDashboard() {
        if (!newTitle.value.trim()) return;
        const dashboard = store.createDashboard({
            title: newTitle.value.trim(),
            description: newDescription.value.trim() || undefined,
            icon: newIcon.value,
        });
        showCreateDialog.value = false;
        router.push({name: 'analytics-dashboard', params: {id: dashboard.id}});
    }
</script>

<template>
    <div
        class="dashboard-sidebar d-flex flex-column"
        :class="{expanded}"
        @mouseenter="requestExpand"
        @mouseleave="requestCollapse"
    >
        <!-- System dashboards -->
        <div class="px-3 pt-3 pb-1">
            <div
                class="text-overline text-medium-emphasis px-2"
                style="font-size: 0.6875rem !important"
            >
                System
            </div>
        </div>
        <v-list
            density="compact"
            nav
            class="px-2 pt-0"
        >
            <v-list-item
                v-for="d in store.systemDashboards"
                :key="d.id"
                :active="activeDashboardId === d.id"
                color="primary"
                rounded="lg"
                @click="selectDashboard(d.id)"
            >
                <template #prepend>
                    <v-icon
                        :icon="d.icon"
                        size="small"
                        :color="d.id === 'system-dora' ? 'success' : 'info'"
                    />
                </template>
                <v-list-item-title class="text-body-2">{{ d.title }}</v-list-item-title>
                <template #append>
                    <v-icon
                        size="x-small"
                        color="grey"
                        >mdi-lock-outline</v-icon
                    >
                </template>
            </v-list-item>
        </v-list>

        <v-divider class="mx-4 my-1" />

        <!-- User dashboards -->
        <div class="px-3 pt-2 pb-1">
            <div
                class="text-overline text-medium-emphasis px-2"
                style="font-size: 0.6875rem !important"
            >
                My Dashboards
            </div>
        </div>
        <v-list
            density="compact"
            nav
            class="px-2 pt-0 flex-grow-1"
            style="min-height: 0; overflow-y: auto"
        >
            <v-list-item
                v-for="d in store.userDashboards"
                :key="d.id"
                :active="activeDashboardId === d.id"
                color="primary"
                rounded="lg"
                @click="selectDashboard(d.id)"
            >
                <template #prepend>
                    <v-icon
                        :icon="d.icon"
                        size="small"
                        color="secondary"
                    />
                </template>
                <v-list-item-title
                    v-if="renamingId !== d.id"
                    class="text-body-2"
                    >{{ d.title }}</v-list-item-title
                >
                <v-text-field
                    v-else
                    v-model="renameValue"
                    density="compact"
                    variant="underlined"
                    hide-details
                    autofocus
                    class="text-body-2"
                    @keyup.enter="confirmRename"
                    @blur="confirmRename"
                    @click.stop
                />
                <template
                    v-if="renamingId !== d.id"
                    #append
                >
                    <div class="d-flex ga-0 dashboard-actions">
                        <v-btn
                            icon
                            variant="text"
                            size="x-small"
                            @click.stop="startRename(d)"
                        >
                            <v-icon size="14">mdi-pencil-outline</v-icon>
                        </v-btn>
                        <v-btn
                            icon
                            variant="text"
                            size="x-small"
                            @click.stop="confirmDelete(d.id)"
                        >
                            <v-icon size="14">mdi-delete-outline</v-icon>
                        </v-btn>
                    </div>
                </template>
            </v-list-item>
        </v-list>

        <!-- New dashboard button -->
        <div class="px-3 pb-3">
            <v-btn
                variant="outlined"
                size="small"
                block
                class="text-none"
                style="border-style: dashed"
                @click="openCreateDialog"
            >
                <v-icon
                    start
                    size="small"
                    >mdi-plus</v-icon
                >
                New Dashboard
            </v-btn>
        </div>

        <!-- Delete confirmation -->
        <v-dialog
            v-model="showDeleteDialog"
            max-width="400"
        >
            <v-card v-if="deleteConfirmId">
                <v-card-title>Delete Dashboard</v-card-title>
                <v-card-text> This will permanently delete this dashboard and all its widgets. This action cannot be undone. </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn
                        text="Cancel"
                        @click="deleteConfirmId = null"
                    />
                    <v-btn
                        text="Delete"
                        color="error"
                        variant="flat"
                        @click="executeDelete"
                    />
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Create dashboard dialog -->
        <v-dialog
            v-model="showCreateDialog"
            max-width="480"
        >
            <v-card>
                <v-card-title class="d-flex align-center ga-2">
                    <v-icon
                        size="small"
                        color="primary"
                        >mdi-chart-box-plus-outline</v-icon
                    >
                    Create Dashboard
                </v-card-title>
                <v-card-text>
                    <v-text-field
                        v-model="newTitle"
                        label="Dashboard Name"
                        placeholder="e.g. Team Performance, Release Velocity"
                        variant="outlined"
                        density="compact"
                        autofocus
                        :rules="[(v: string) => !!v.trim() || 'Required']"
                        class="mb-3"
                    />
                    <v-textarea
                        v-model="newDescription"
                        label="Description"
                        placeholder="Optional description for this dashboard"
                        variant="outlined"
                        density="compact"
                        rows="2"
                        class="mb-3"
                    />
                    <div class="text-caption text-medium-emphasis mb-2">Icon</div>
                    <div class="d-flex ga-2 flex-wrap">
                        <v-btn
                            v-for="icon in iconOptions"
                            :key="icon"
                            :icon="icon"
                            size="small"
                            :variant="newIcon === icon ? 'flat' : 'outlined'"
                            :color="newIcon === icon ? 'primary' : undefined"
                            @click="newIcon = icon"
                        />
                    </div>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn
                        text="Cancel"
                        @click="showCreateDialog = false"
                    />
                    <v-btn
                        text="Create"
                        color="primary"
                        variant="flat"
                        :disabled="!newTitle.trim()"
                        @click="createDashboard"
                    />
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<style scoped>
    .dashboard-sidebar {
        width: 0;
        min-width: 0;
        flex-shrink: 0;
        border-right: none;
        background: rgb(var(--v-theme-surface));
        opacity: 0;
        overflow: hidden;
        transition:
            width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
            opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1),
            border-right-width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
    }

    .dashboard-sidebar.expanded {
        width: 240px;
        min-width: 240px;
        opacity: 1;
        border-right: 1px solid rgb(var(--v-border-color), var(--v-border-opacity));
        pointer-events: auto;
    }

    .dashboard-actions {
        opacity: 0;
        transition: opacity 0.15s ease;
    }

    .v-list-item:hover .dashboard-actions {
        opacity: 1;
    }
</style>
