import {ref, type Ref} from 'vue';

export type WebSocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface UseWebSocketOptions {
    /** The WebSocket endpoint URL (without token query params). */
    endpoint: string;

    /** Channel name sent as a query parameter to identify the subscription. */
    channel: string;

    /** Fetches a short-lived auth token appended as `?token=<value>`. */
    fetchToken: () => Promise<string>;

    /** Called for every incoming message with the parsed JSON payload. */
    onMessage: (data: unknown) => void;

    /**
     * Seconds before token expiry to trigger renewal.
     * @default 30
     */
    renewalBufferSeconds?: number;

    /**
     * Milliseconds to wait before attempting automatic reconnection.
     * @default 5000
     */
    reconnectDelayMs?: number;
}

export interface UseWebSocketReturn {
    /** Reactive connection status. */
    status: Ref<WebSocketStatus>;

    /** Open the WebSocket connection (no-op if already open/connecting). */
    connect: () => Promise<void>;

    /** Gracefully close the connection. */
    disconnect: () => void;

    /** Send a JSON-serialisable payload over the open connection. */
    send: (data: unknown) => void;
}

/**
 * Generic composable that manages a token-authenticated WebSocket connection
 * with automatic token renewal and reconnection.
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
    const {endpoint, channel, fetchToken, onMessage, renewalBufferSeconds = 30, reconnectDelayMs = 5000} = options;

    const status = ref<WebSocketStatus>('idle');

    let ws: WebSocket | null = null;
    let tokenRenewalTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Token helpers ────────────────────────────────────────────────

    const getTokenExpiry = (token: string): number => {
        try {
            const parts = token.split('.');
            if (parts.length < 2) return 0;
            const payloadJson = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
            const payload = JSON.parse(payloadJson) as {exp?: number};
            return payload.exp ?? 0;
        } catch {
            return 0;
        }
    };

    // ── Timer management ─────────────────────────────────────────────

    const clearTimers = () => {
        if (tokenRenewalTimer) {
            clearTimeout(tokenRenewalTimer);
            tokenRenewalTimer = null;
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };

    const scheduleReconnect = () => {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, reconnectDelayMs);
    };

    const scheduleTokenRenewal = (token: string) => {
        if (tokenRenewalTimer) {
            clearTimeout(tokenRenewalTimer);
            tokenRenewalTimer = null;
        }

        const expiryTime = getTokenExpiry(token);
        if (!expiryTime) return;

        const secondsUntilExpiry = expiryTime - Math.floor(Date.now() / 1000);
        const renewalDelay = Math.max(0, (secondsUntilExpiry - renewalBufferSeconds) * 1000);

        tokenRenewalTimer = setTimeout(async () => {
            try {
                const oldWs = ws;
                ws = null; // Allow new connection

                await connect();

                // Gracefully close old connection after new one is established
                if (oldWs && oldWs.readyState === WebSocket.OPEN) {
                    setTimeout(() => {
                        oldWs.onclose = null;
                        oldWs.close(1000, 'Token renewal');
                    }, 3000);
                }
            } catch {
                scheduleReconnect();
            }
        }, renewalDelay);
    };

    // ── Core API ─────────────────────────────────────────────────────

    const connect = async (): Promise<void> => {
        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
            return;
        }

        if (!endpoint) {
            console.warn('WebSocket endpoint not configured');
            return;
        }

        status.value = 'connecting';

        try {
            const token = await fetchToken();
            scheduleTokenRenewal(token);

            const wsUrl = `${endpoint}?token=${encodeURIComponent(token)}&channel=${encodeURIComponent(channel)}`;
            const newWs = new WebSocket(wsUrl);

            await new Promise<void>((resolve, reject) => {
                newWs.onopen = () => resolve();
                newWs.onerror = (error) => reject(error);
            });

            ws = newWs;
            status.value = 'connected';

            ws.onmessage = (event) => {
                try {
                    const data: unknown = JSON.parse(event.data as string);
                    onMessage(data);
                } catch (error) {
                    console.error('Failed to parse WebSocket message', error);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error', error);
            };

            ws.onclose = (event) => {
                ws = null;
                status.value = 'disconnected';
                clearTimers();

                if (event.code !== 1000) {
                    scheduleReconnect();
                }
            };
        } catch (error) {
            status.value = 'disconnected';
            throw error;
        }
    };

    const disconnect = () => {
        clearTimers();
        if (ws) {
            ws.onclose = null;
            ws.close(1000, 'Client disconnect');
            ws = null;
        }
        status.value = 'disconnected';
    };

    const send = (data: unknown) => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    };

    return {status, connect, disconnect, send};
}
