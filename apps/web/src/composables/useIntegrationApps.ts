import {useAuth} from '@/composables/useAuth';
import {parseApiResponse} from '@/utils/apiResponse';
import type {IntegrationApp, IntegrationAppType, NotificationHandle} from '@common/types';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

const JSON_HEADERS = {'Content-Type': 'application/json'};

// The API explains 400 and 409 responses (invalid URL, handle limit, app already installed) in `message`.
async function failure(response: Response, fallback: string): Promise<Error> {
    const body = await response.json().catch(() => null);
    const message = body && typeof body.message === 'string' ? body.message : `${fallback}: ${response.status}`;
    return new Error(message);
}

export const useIntegrationApps = () => {
    const {fetchWithAuth} = useAuth();

    const listApps = async (integrationId: string): Promise<IntegrationApp[]> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/apps`);
        if (!response.ok) {
            throw new Error(`Failed to fetch apps: ${response.status}`);
        }
        return parseApiResponse<IntegrationApp[]>(response);
    };

    const installApp = async (integrationId: string, type: IntegrationAppType): Promise<IntegrationApp> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/apps`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({type}),
        });
        if (response.status !== 201) {
            throw await failure(response, 'Failed to install app');
        }
        return parseApiResponse<IntegrationApp>(response);
    };

    const uninstallApp = async (integrationId: string, appId: string): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/apps/${appId}`, {method: 'DELETE'});
        if (!response.ok) {
            throw await failure(response, 'Failed to uninstall app');
        }
    };

    const createHandle = async (integrationId: string, appId: string, input: {name: string; url: string}): Promise<NotificationHandle> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/apps/${appId}/handles`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            throw await failure(response, 'Failed to create handle');
        }
        return parseApiResponse<NotificationHandle>(response);
    };

    const updateHandle = async (integrationId: string, handleId: string, input: {name?: string; url?: string}): Promise<NotificationHandle> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/handles/${handleId}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            throw await failure(response, 'Failed to update handle');
        }
        return parseApiResponse<NotificationHandle>(response);
    };

    const deleteHandle = async (integrationId: string, handleId: string): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/handles/${handleId}`, {method: 'DELETE'});
        if (!response.ok) {
            throw await failure(response, 'Failed to delete handle');
        }
    };

    return {listApps, installApp, uninstallApp, createHandle, updateHandle, deleteHandle};
};
