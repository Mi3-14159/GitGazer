<script setup lang="ts">
    import CustomWidgetCard from '@/components/CustomWidgetCard.vue';
    import CustomWidgetDialog from '@/components/CustomWidgetDialog.vue';
    import {useCustomMetrics} from '@/composables/useCustomMetrics';
    import {useCustomWidgetsStore} from '@/stores/customWidgets';
    import type {ChartType, CustomWidget, WidgetColumnConfig} from '@common/types/metrics';
    import {GridItem, GridLayout} from 'grid-layout-plus';
    import {onMounted, ref, watch} from 'vue';

    const props = defineProps<{
        integrationId: string | null;
    }>();

    const store = useCustomWidgetsStore();
    const {executeQuery, fetchSchema, schema} = useCustomMetrics();

    const showDialog = ref(false);
    const editingWidget = ref<CustomWidget | undefined>();
    const loadingWidgets = ref<Record<string, boolean>>({});
    const isAnyLoading = ref(false);

    const gridLayout = ref<{i: string; x: number; y: number; w: number; h: number}[]>([]);

    function syncGridLayout() {
        gridLayout.value = store.widgets.map((w) => ({
            i: w.id,
            x: w.position.x,
            y: w.position.y,
            w: w.position.w,
            h: w.position.h,
        }));
    }

    onMounted(async () => {
        syncGridLayout();
        await fetchSchema();
        if (store.widgets.length > 0 && props.integrationId) {
            await refreshAllWidgets();
        }
    });

    watch(
        () => props.integrationId,
        async (newId) => {
            if (newId && store.widgets.length > 0) {
                await refreshAllWidgets();
            }
        },
    );

    async function refreshAllWidgets() {
        isAnyLoading.value = true;
        await Promise.all(store.widgets.map((w) => executeWidgetQuery(w)));
        isAnyLoading.value = false;
    }

    async function executeWidgetQuery(widget: CustomWidget) {
        if (!props.integrationId) return;
        loadingWidgets.value[widget.id] = true;
        try {
            const result = await executeQuery(props.integrationId, widget.query);
            if (result) {
                store.setWidgetResult(widget.id, result);
            } else {
                store.setWidgetError(widget.id, 'Query returned no results or failed');
            }
        } catch (e) {
            store.setWidgetError(widget.id, e instanceof Error ? e.message : 'Query execution failed');
        } finally {
            loadingWidgets.value[widget.id] = false;
        }
    }

    function handleAddWidget() {
        editingWidget.value = undefined;
        showDialog.value = true;
    }

    function handleEditWidget(widget: CustomWidget) {
        editingWidget.value = widget;
        showDialog.value = true;
    }

    function handleRemoveWidget(id: string) {
        store.removeWidget(id);
        delete loadingWidgets.value[id];
        syncGridLayout();
    }

    async function handleSaveWidget(params: {title: string; query: string; chartType: ChartType; config: WidgetColumnConfig}) {
        if (editingWidget.value) {
            store.updateWidget(editingWidget.value.id, params);
            const updated = store.widgets.find((w) => w.id === editingWidget.value!.id);
            if (updated) await executeWidgetQuery(updated);
        } else {
            const widget = store.addWidget(params);
            syncGridLayout();
            await executeWidgetQuery(widget);
        }
        showDialog.value = false;
        editingWidget.value = undefined;
    }

    function handleLayoutUpdate(newLayout: {i: string; x: number; y: number; w: number; h: number}[]) {
        store.updateLayout(newLayout);
    }
</script>

<template>
    <div>
        <!-- Empty state -->
        <v-card
            v-if="store.widgets.length === 0"
            variant="outlined"
            class="rounded-lg pa-8 text-center"
        >
            <v-icon
                size="64"
                color="grey"
                class="mb-4"
                >mdi-chart-box-plus-outline</v-icon
            >
            <h3 class="text-h6 text-medium-emphasis">No custom widgets yet</h3>
            <p class="text-body-2 text-medium-emphasis mt-2 mb-4">
                Create custom widgets by writing SQL queries against your GitHub data. Choose from charts, tables, and gauges to visualize results.
                Drag and resize widgets to build your dashboard.
            </p>
            <v-btn
                color="primary"
                variant="flat"
                @click="handleAddWidget"
            >
                <v-icon
                    start
                    size="small"
                    >mdi-plus</v-icon
                >
                Add Widget
            </v-btn>
        </v-card>

        <!-- Dashboard grid -->
        <template v-else>
            <div class="d-flex align-center mb-4 ga-2">
                <v-btn
                    color="primary"
                    variant="tonal"
                    size="small"
                    @click="handleAddWidget"
                >
                    <v-icon
                        start
                        size="small"
                        >mdi-plus</v-icon
                    >
                    Add Widget
                </v-btn>
                <v-btn
                    variant="tonal"
                    size="small"
                    :loading="isAnyLoading"
                    @click="refreshAllWidgets"
                >
                    <v-icon
                        start
                        size="small"
                        >mdi-refresh</v-icon
                    >
                    Refresh All
                </v-btn>
            </div>

            <GridLayout
                :layout="gridLayout"
                :col-num="12"
                :row-height="80"
                :margin="[16, 16]"
                :is-draggable="true"
                :is-resizable="true"
                @layout-updated="handleLayoutUpdate"
            >
                <GridItem
                    v-for="widget in store.widgets"
                    :key="widget.id"
                    :i="widget.id"
                    :x="widget.position.x"
                    :y="widget.position.y"
                    :w="widget.position.w"
                    :h="widget.position.h"
                    :min-w="3"
                    :min-h="3"
                    drag-allow-from=".v-card-item"
                >
                    <CustomWidgetCard
                        :widget="widget"
                        :result="store.widgetResults[widget.id]"
                        :error="store.widgetErrors[widget.id]"
                        :loading="!!loadingWidgets[widget.id]"
                        @edit="handleEditWidget(widget)"
                        @remove="handleRemoveWidget(widget.id)"
                    />
                </GridItem>
            </GridLayout>
        </template>

        <!-- Add/Edit dialog -->
        <v-dialog
            v-model="showDialog"
            max-width="900"
        >
            <CustomWidgetDialog
                :integration-id="integrationId"
                :schema="schema"
                :edit-widget="editingWidget"
                @save="handleSaveWidget"
                @cancel="showDialog = false"
            />
        </v-dialog>
    </div>
</template>
