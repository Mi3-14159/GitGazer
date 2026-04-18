import * as crypto from 'crypto';

const signPayload = (payload: string, secret: string): string => {
    const hmac = crypto.createHmac('sha256', secret);
    return 'sha256=' + hmac.update(payload).digest('hex');
};

interface ImportApiConfig {
    apiUrl: string;
    integrationId: string;
    secret: string;
}

export const createImportClient = (config: ImportApiConfig) => {
    const {apiUrl, integrationId, secret} = config;
    const baseUrl = apiUrl.replace(/\/+$/, '');

    const sendEvent = async (eventType: string, payload: unknown): Promise<void> => {
        const body = JSON.stringify(payload);
        const signature = signPayload(body, secret);

        const url = `${baseUrl}/api/import/${encodeURIComponent(integrationId)}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-GitHub-Event': eventType,
                'X-Hub-Signature-256': signature,
                'X-GitGazer-Source': 'backfill',
            },
            body,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API error ${response.status} for ${eventType}: ${text}`);
        }
    };

    return {sendEvent};
};

export type ImportClient = ReturnType<typeof createImportClient>;
