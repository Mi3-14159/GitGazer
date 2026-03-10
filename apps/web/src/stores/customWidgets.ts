import type {ChartType, CustomQueryResponse, CustomWidget, WidgetColumnConfig} from '@common/types/metrics';
import {defineStore} from 'pinia';
import {ref, watch} from 'vue';

const STORAGE_KEY = 'gitgazer:custom-widgets';

function loadWidgets(): CustomWidget[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveWidgets(widgets: CustomWidget[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

export const useCustomWidgetsStore = defineStore('customWidgets', () => {
    const widgets = ref<CustomWidget[]>(loadWidgets());
    const widgetResults = ref<Record<string, CustomQueryResponse>>({});
    const widgetErrors = ref<Record<string, string>>({});

    watch(widgets, (val) => saveWidgets(val), {deep: true});

    function addWidget(params: {title: string; query: string; chartType: ChartType; config: WidgetColumnConfig}): CustomWidget {
        const id = crypto.randomUUID();
        const existingPositions = widgets.value.map((w) => w.position);
        const maxY = existingPositions.length > 0 ? Math.max(...existingPositions.map((p) => p.y + p.h)) : 0;

        const widget: CustomWidget = {
            id,
            title: params.title,
            query: params.query,
            chartType: params.chartType,
            position: {x: (widgets.value.length % 2) * 6, y: maxY, w: 6, h: 4},
            config: params.config,
        };
        widgets.value.push(widget);
        return widget;
    }

    function removeWidget(id: string) {
        widgets.value = widgets.value.filter((w) => w.id !== id);
        delete widgetResults.value[id];
        delete widgetErrors.value[id];
    }

    function updateWidget(id: string, updates: Partial<Omit<CustomWidget, 'id'>>) {
        const index = widgets.value.findIndex((w) => w.id === id);
        if (index !== -1) {
            widgets.value[index] = {...widgets.value[index], ...updates};
        }
    }

    function updateLayout(layouts: {i: string; x: number; y: number; w: number; h: number}[]) {
        for (const layout of layouts) {
            const widget = widgets.value.find((w) => w.id === layout.i);
            if (widget) {
                widget.position = {x: layout.x, y: layout.y, w: layout.w, h: layout.h};
            }
        }
    }

    function setWidgetResult(widgetId: string, result: CustomQueryResponse) {
        widgetResults.value[widgetId] = result;
        delete widgetErrors.value[widgetId];
    }

    function setWidgetError(widgetId: string, error: string) {
        widgetErrors.value[widgetId] = error;
    }

    return {
        widgets,
        widgetResults,
        widgetErrors,
        addWidget,
        removeWidget,
        updateWidget,
        updateLayout,
        setWidgetResult,
        setWidgetError,
    };
});
