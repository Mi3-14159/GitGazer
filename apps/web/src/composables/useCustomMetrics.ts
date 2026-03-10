import {useAuth} from '@/composables/useAuth';
import type {CustomQueryResponse, TableSchema} from '@common/types/metrics';
import {ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export const useCustomMetrics = () => {
    const {fetchWithAuth} = useAuth();
    const isExecuting = ref(false);
    const isLoadingSchema = ref(false);
    const queryError = ref<string | null>(null);
    const queryResult = ref<CustomQueryResponse | null>(null);
    const schema = ref<TableSchema[]>([]);

    const executeQuery = async (integrationId: string, query: string): Promise<CustomQueryResponse | null> => {
        isExecuting.value = true;
        queryError.value = null;
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/metrics/custom/query?integrationId=${encodeURIComponent(integrationId)}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({query}),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error ?? `Query failed: ${response.status}`);
            }
            queryResult.value = (await response.json()) as CustomQueryResponse;
            return queryResult.value;
        } catch (e) {
            queryError.value = e instanceof Error ? e.message : 'Unknown error';
            return null;
        } finally {
            isExecuting.value = false;
        }
    };

    const fetchSchema = async (): Promise<TableSchema[]> => {
        isLoadingSchema.value = true;
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/metrics/custom/schema`);
            if (!response.ok) return [];
            schema.value = (await response.json()) as TableSchema[];
            return schema.value;
        } catch {
            return [];
        } finally {
            isLoadingSchema.value = false;
        }
    };

    return {
        isExecuting,
        isLoadingSchema,
        queryError,
        queryResult,
        schema,
        executeQuery,
        fetchSchema,
    };
};
