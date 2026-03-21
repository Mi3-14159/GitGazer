import {type ColumnConfig, type FilterValue, type TableView, defaultColumns, defaultView} from '@/types/table';
import {ref, watch} from 'vue';

const STORAGE_KEY = 'gitgazer-table-views';

export function useTableViews() {
    const savedViews = ref<TableView[]>(loadViews());
    const currentView = ref<TableView>(savedViews.value[0] ?? defaultView);

    function loadViews(): TableView[] {
        const base = {...defaultView, columns: defaultColumns.map((c) => ({...c}))};
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as TableView[];
                if (parsed.length > 0) return [base, ...parsed];
            }
        } catch {
            // ignore
        }
        return [base];
    }

    function persistViews() {
        const custom = savedViews.value.filter((v) => !v.isDefault);
        if (custom.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    watch(savedViews, persistViews, {deep: true});

    function updateColumns(columns: ColumnConfig[]) {
        currentView.value = {...currentView.value, columns};
    }

    function updateFilters(filters: FilterValue[]) {
        currentView.value = {...currentView.value, filters};
        // Sync to saved views so the change persists in localStorage
        const idx = savedViews.value.findIndex((v) => v.id === currentView.value.id);
        if (idx >= 0) {
            savedViews.value[idx] = {...savedViews.value[idx], filters};
        }
    }

    function saveView(view: TableView) {
        const idx = savedViews.value.findIndex((v) => v.id === view.id);
        if (idx >= 0) {
            savedViews.value[idx] = view;
        } else {
            savedViews.value.push(view);
        }
        currentView.value = view;
    }

    function deleteView(viewId: string) {
        savedViews.value = savedViews.value.filter((v) => v.id !== viewId);
        if (currentView.value.id === viewId) {
            currentView.value = savedViews.value[0] ?? {...defaultView, columns: defaultColumns.map((c) => ({...c}))};
        }
    }

    function changeView(view: TableView) {
        currentView.value = view;
    }

    return {
        savedViews,
        currentView,
        updateColumns,
        updateFilters,
        saveView,
        deleteView,
        changeView,
    };
}
