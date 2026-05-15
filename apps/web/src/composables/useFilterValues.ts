import type {DateRange} from '@/components/filters/DateTimeRangePicker.vue';
import type {CheckboxOption} from '@/components/ui/SearchableCheckboxList.vue';
import {useAuth} from '@/composables/useAuth';
import type {FilterValueResult} from '@common/types';
import {ref, watch, type Ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export function useFilterValues(columnId: string, dateRange: Ref<DateRange>) {
    const {fetchWithAuth} = useAuth();

    const options = ref<CheckboxOption[]>([]);
    const isLoading = ref(false);
    const searchTerm = ref('');

    let abortController: AbortController | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function buildDateParams(): URLSearchParams {
        const params = new URLSearchParams({column: columnId});
        const dr = dateRange.value;
        if (dr.window) {
            params.set('window', dr.window);
        } else {
            if (dr.from) params.set('created_from', dr.from.toISOString());
            if (dr.to) params.set('created_to', dr.to.toISOString());
        }
        return params;
    }

    async function fetchValues(search?: string) {
        abortController?.abort();
        abortController = new AbortController();

        isLoading.value = true;
        try {
            const params = buildDateParams();
            if (search) params.set('search', search);

            const response = await fetchWithAuth(`${API_ENDPOINT}/workflows/filter-values?${params}`, {
                signal: abortController.signal,
            });

            if (!response.ok) return;

            const data: FilterValueResult[] = await response.json();
            options.value = data.map((d) => ({value: d.value, label: d.value, count: d.count}));
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                options.value = [];
            }
        } finally {
            isLoading.value = false;
        }
    }

    watch(searchTerm, (term) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchValues(term || undefined), 200);
    });

    // Re-fetch when date range changes (if popover was already opened)
    watch(
        dateRange,
        () => {
            if (options.value.length > 0) {
                fetchValues(searchTerm.value || undefined);
            }
        },
        {deep: true},
    );

    function open() {
        fetchValues(searchTerm.value || undefined);
    }

    function cleanup() {
        abortController?.abort();
        if (debounceTimer) clearTimeout(debounceTimer);
    }

    return {options, isLoading, searchTerm, open, cleanup};
}
