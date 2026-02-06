import {useAuth} from '@/composables/useAuth';
import {QueryRequestBody, QueryResponse, TableSchema} from '@common/types/analytics';
import {ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export const useAnalytics = () => {
    const {fetchWithAuth} = useAuth();
    const isPolling = ref(false);
    const isSubmitting = ref(false);

    const submitQuery = async (integrationId: string, query: string): Promise<QueryResponse> => {
        isSubmitting.value = true;
        try {
            const body: QueryRequestBody = {query};
            const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/analytics/queries`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                throw new Error(`Failed to submit query: ${response.status}`);
            }

            return (await response.json()) as QueryResponse;
        } finally {
            isSubmitting.value = false;
        }
    };

    const getQueryStatus = async (queryId: string): Promise<QueryResponse> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/analytics/queries/${queryId}`);

        if (!response.ok) {
            throw new Error(`Failed to get query status: ${response.status}`);
        }

        return (await response.json()) as QueryResponse;
    };

    const pollUntilComplete = async (
        queryId: string,
        onUpdate: (status: QueryResponse) => void,
        intervalMs: number = 3000,
        maxAttempts: number = 60,
    ): Promise<void> => {
        return new Promise((resolve, reject) => {
            isPolling.value = true;
            let attempts = 0;

            const interval = setInterval(async () => {
                try {
                    attempts++;

                    const status = await getQueryStatus(queryId);
                    onUpdate(status);

                    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status.status || '')) {
                        clearInterval(interval);
                        isPolling.value = false;
                        resolve();
                    } else if (attempts >= maxAttempts) {
                        clearInterval(interval);
                        isPolling.value = false;
                        reject(new Error('Query polling timeout'));
                    }
                } catch (error) {
                    clearInterval(interval);
                    isPolling.value = false;
                    reject(error);
                }
            }, intervalMs);
        });
    };

    const getSchema = async (): Promise<TableSchema> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/analytics/schema`);

        if (!response.ok) {
            throw new Error(`Failed to get schema: ${response.status}`);
        }

        return (await response.json()) as TableSchema;
    };

    return {
        submitQuery,
        getQueryStatus,
        pollUntilComplete,
        isPolling,
        isSubmitting,
        getSchema,
    };
};
