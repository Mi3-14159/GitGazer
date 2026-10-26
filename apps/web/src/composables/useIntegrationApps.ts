import {useAuth} from '@/composables/useAuth';
import {parseApiResponse} from '@/utils/apiResponse';
import type {IntegrationApp, IntegrationAppType, NotificationHandle, SlackChannel} from '@common/types';
import {useRouter} from 'vue-router';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

const JSON_HEADERS = {'Content-Type': 'application/json'};

export type MoveCandidate = {handleId: string; name: string; ruleCount: number};
export type MoveResult = {moved: string[]; failed: string[]; webhookAppEmpty: boolean};

// The API explains 400 and 409 responses (invalid URL, handle limit, app already installed) in `message`.
async function failure(response: Response, fallback: string): Promise<Error> {
    const body = await response.json().catch(() => null);
    const message = body && typeof body.message === 'string' ? body.message : `${fallback}: ${response.status}`;
    return new Error(message);
}

export const useIntegrationApps = () => {
    const {fetchWithAuth, refreshSession} = useAuth();
    const router = useRouter();

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

    const slackInstallUrl = (integrationId: string, redirectUrl: string): string =>
        `${API_ENDPOINT}/integrations/${integrationId}/apps/slack/install?redirect_url=${encodeURIComponent(redirectUrl)}`;

    const slackConnectUrl = (integrationId: string, redirectUrl: string): string =>
        `${API_ENDPOINT}/integrations/${integrationId}/slack/connect?redirect_url=${encodeURIComponent(redirectUrl)}`;

    const connectSlack = async (integrationId: string): Promise<void> => {
        // A long Slack consent screen can outlast the access token the callback needs.
        if (!(await refreshSession())) {
            throw new Error('Your session expired. Sign in again to connect Slack.');
        }
        // Always return to the Members tab: the Apps tab reads the same query params as install outcomes.
        const membersPath = router.resolve({name: 'integration', params: {integrationId, tab: 'members'}}).href;
        window.location.assign(slackConnectUrl(integrationId, window.location.origin + membersPath));
    };

    const listSlackChannels = async (integrationId: string, appId: string): Promise<SlackChannel[]> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/apps/${appId}/slack/channels`);
        if (!response.ok) {
            throw await failure(response, 'Failed to load Slack channels');
        }
        return parseApiResponse<SlackChannel[]>(response);
    };

    const createSlackHandle = async (
        integrationId: string,
        appId: string,
        input: {channelId: string; name?: string},
    ): Promise<NotificationHandle> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/apps/${appId}/handles`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            throw await failure(response, 'Failed to add channel');
        }
        return parseApiResponse<NotificationHandle>(response);
    };

    const listMoveCandidates = async (integrationId: string): Promise<MoveCandidate[]> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/apps/slack/move-candidates`);
        if (!response.ok) {
            throw await failure(response, 'Failed to load Webhook handles to move');
        }
        return parseApiResponse<MoveCandidate[]>(response);
    };

    const moveWebhookHandles = async (integrationId: string, moves: {webhookHandleId: string; channelId: string}[]): Promise<MoveResult> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/apps/slack/move`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({moves}),
        });
        if (!response.ok) {
            throw await failure(response, 'Failed to move Webhook handles');
        }
        return parseApiResponse<MoveResult>(response);
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

    return {
        listApps,
        installApp,
        uninstallApp,
        createHandle,
        updateHandle,
        deleteHandle,
        slackInstallUrl,
        connectSlack,
        listSlackChannels,
        createSlackHandle,
        listMoveCandidates,
        moveWebhookHandles,
    };
};
