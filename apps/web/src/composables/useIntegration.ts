import {useAuth} from '@/composables/useAuth';
import {Integration} from '@common/types';
import {ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export const useIntegration = () => {
    const {fetchWithAuth} = useAuth();
    const isLoadingIntegrations = ref(false);

    const getIntegrations = async () => {
        isLoadingIntegrations.value = true;
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/integrations`);

            if (!response.ok) {
                throw new Error(`Failed to fetch integrations: ${response.status}`);
            }

            const integrations = (await response.json()) as Integration[];
            return integrations;
        } finally {
            isLoadingIntegrations.value = false;
        }
    };

    const createIntegration = async (label: string): Promise<Integration> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({label}),
        });

        if (!response.ok) {
            throw new Error(`Failed to create integration: ${response.status}`);
        }

        return (await response.json()) as Integration;
    };

    const updateIntegration = async (id: string, label: string): Promise<Integration> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({label}),
        });

        if (!response.ok) {
            throw new Error(`Failed to update integration: ${response.status}`);
        }

        return (await response.json()) as Integration;
    };

    const deleteIntegration = async (id: string): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${id}`, {
            method: 'DELETE',
        });

        if (response.status !== 204) {
            throw new Error(`Failed to delete integration: ${response.status}`);
        }
    };

    return {
        getIntegrations,
        isLoadingIntegrations,
        createIntegration,
        updateIntegration,
        deleteIntegration,
    };
};
