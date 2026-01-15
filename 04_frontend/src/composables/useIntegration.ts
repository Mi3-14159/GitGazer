import {Integration} from '@common/types';
import * as api from '@/api/client';
import {ref} from 'vue';

export const useIntegration = () => {
    const isLoadingIntegrations = ref(false);

    const getIntegrations = async () => {
        isLoadingIntegrations.value = true;
        const response = await api.get<Integration[]>('/integrations');
        isLoadingIntegrations.value = false;
        return response.data;
    };

    const createIntegration = async (label: string): Promise<Integration> => {
        const response = await api.post<Integration>('/integrations', {label});
        return response.data;
    };

    const deleteIntegration = async (id: string): Promise<void> => {
        const response = await api.del(`/integrations/${id}`);
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
