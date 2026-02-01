import {Integration} from '@common/types';
import {ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export const useIntegration = () => {
    const isLoadingIntegrations = ref(false);

    const getIntegrations = async () => {
        isLoadingIntegrations.value = true;
        try {
            const response = await fetch(`${API_ENDPOINT}/integrations`, {
                credentials: 'include',
            });

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
        const response = await fetch(`${API_ENDPOINT}/integrations`, {
            method: 'POST',
            credentials: 'include',
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

    const deleteIntegration = async (id: string): Promise<void> => {
        const response = await fetch(`${API_ENDPOINT}/integrations/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (response.status !== 204) {
            throw new Error(`Failed to delete integration: ${response.status}`);
        }
    };

    return {
        getIntegrations,
        isLoadingIntegrations,
        createIntegration,
        deleteIntegration,
    };
};
