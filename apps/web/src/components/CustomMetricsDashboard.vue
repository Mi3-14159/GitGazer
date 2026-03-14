<script setup lang="ts">
    import CustomWidgetCard from '@/components/CustomWidgetCard.vue';
    import CustomWidgetDialog from '@/components/CustomWidgetDialog.vue';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import {useCustomMetrics} from '@/composables/useCustomMetrics';
    import {useCustomWidgetsStore} from '@/stores/customWidgets';
    import type {ChartType, CustomWidget, WidgetColumnConfig} from '@common/types/metrics';
    import {GridItem, GridLayout} from 'grid-layout-plus';
    import {LayoutGrid, Plus} from 'lucide-vue-next';
    import {computed, onMounted, ref, watch} from 'vue';

    const props = defineProps<{
        dashboardId: string;
        integrationId: string;
    }>();

    const widgetStore = useCustomWidgetsStore();
    const {executeQuery} = useCustomMetrics();

    const showAddDialog = ref(false);
    const editingWidget = ref<CustomWidget | null>(null);

    const dashboardWidgets = computed(
        () => widgetStore.widgets.filter(() => true), // All widgets for now; could filter by dashboardId
    );

    const layout = computed(() =>
        dashboardWidgets.value.map((w) => ({
            i: w.id,
            x: w.position.x,
            y: w.position.y,
            w: w.position.w,
            h: w.position.h,
        })),
    );

    function onLayoutUpdated(newLayout: {i: string; x: number; y: number; w: number; h: number}[]) {
        widgetStore.updateLayout(newLayout);
    }

    async function executeWidgetQuery(widget: CustomWidget) {
        if (!props.integrationId) return;
        const result = await executeQuery(props.integrationId, widget.query);
        if (result) {
            widgetStore.setWidgetResult(widget.id, result);
        } else {
            widgetStore.setWidgetError(widget.id, 'Query execution failed');
        }
    }

    onMounted(() => {
        dashboardWidgets.value.forEach(executeWidgetQuery);
    });

    watch(
        () => props.integrationId,
        () => {
            dashboardWidgets.value.forEach(executeWidgetQuery);
        },
    );

    function openAdd() {
        editingWidget.value = null;
        showAddDialog.value = true;
    }

    function openEdit(widget: CustomWidget) {
        editingWidget.value = widget;
        showAddDialog.value = true;
    }

    function handleSave(params: {title: string; query: string; chartType: ChartType; config: WidgetColumnConfig}) {
        if (editingWidget.value) {
            widgetStore.updateWidget(editingWidget.value.id, params);
            executeWidgetQuery({...editingWidget.value, ...params});
        } else {
            const newWidget = widgetStore.addWidget(params);
            executeWidgetQuery(newWidget);
        }
        showAddDialog.value = false;
    }

    function handleDelete(widgetId: string) {
        widgetStore.removeWidget(widgetId);
    }

    function handleRefresh(widget: CustomWidget) {
        executeWidgetQuery(widget);
    }
</script>

<template>
    <div class="space-y-4">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-muted-foreground">
                <LayoutGrid class="h-4 w-4" />
                <span class="text-xs font-medium">Custom Widgets</span>
            </div>
            <Button
                size="sm"
                variant="outline"
                @click="openAdd"
            >
                <Plus class="h-4 w-4" />
                Add Widget
            </Button>
        </div>

        <!-- Empty state -->
        <div
            v-if="dashboardWidgets.length === 0"
            class="rounded-xl border bg-card p-8 text-center"
        >
            <LayoutGrid class="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p class="mt-2 text-sm text-muted-foreground">No widgets yet. Add a custom SQL-powered widget to get started.</p>
            <Button
                size="sm"
                class="mt-4"
                @click="openAdd"
                >Add your first widget</Button
            >
        </div>

        <!-- Grid layout -->
        <GridLayout
            v-else
            :layout="layout"
            :col-num="12"
            :row-height="60"
            :is-draggable="true"
            :is-resizable="true"
            :margin="[12, 12]"
            @layout-updated="onLayoutUpdated"
        >
            <GridItem
                v-for="widget in dashboardWidgets"
                :key="widget.id"
                :i="widget.id"
                :x="widget.position.x"
                :y="widget.position.y"
                :w="widget.position.w"
                :h="widget.position.h"
                :min-w="3"
                :min-h="2"
            >
                <CustomWidgetCard
                    :widget="widget"
                    :result="widgetStore.widgetResults[widget.id]"
                    :error="widgetStore.widgetErrors[widget.id]"
                    @edit="openEdit(widget)"
                    @delete="handleDelete(widget.id)"
                    @refresh="handleRefresh(widget)"
                />
            </GridItem>
        </GridLayout>

        <!-- Add/Edit Widget Dialog -->
        <Dialog
            :open="showAddDialog"
            class="max-w-3xl"
            @update:open="showAddDialog = $event"
        >
            <template #default="{close}">
                <CustomWidgetDialog
                    :existing-widget="editingWidget"
                    :integration-id="props.integrationId"
                    :on-close="close"
                    :on-save="handleSave"
                />
            </template>
        </Dialog>
    </div>
</template>
