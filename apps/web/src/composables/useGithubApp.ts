import {useAuth} from '@/composables/useAuth';
import {ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export type LinkInstallationResponse = {
    installationId: number;
    accountLogin: string;
    accountType: string;
    webhookCount: number;
};

export const useGithubApp = () => {
    const {fetchWithAuth} = useAuth();
    const isLoading = ref(false);

    const linkInstallation = async (integrationId: string, installationId: number): Promise<LinkInstallationResponse> => {
        isLoading.value = true;
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/github-app`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({installation_id: installationId}),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `Failed to link installation: ${response.status}`);
            }
            return (await response.json()) as LinkInstallationResponse;
        } finally {
            isLoading.value = false;
        }
    };

    const unlinkInstallation = async (integrationId: string, installationId: number): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/github-app/${installationId}`, {
            method: 'DELETE',
        });
        if (response.status !== 204) {
            throw new Error(`Failed to unlink installation: ${response.status}`);
        }
    };

    const updateWebhookEvents = async (integrationId: string, installationId: number, events: string[]): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/github-app/${installationId}/events`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({events}),
        });
        if (!response.ok) {
            throw new Error(`Failed to update webhook events: ${response.status}`);
        }
    };

    return {
        isLoading,
        linkInstallation,
        unlinkInstallation,
        updateWebhookEvents,
    };
};
