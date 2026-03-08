import {useAuth} from '@/composables/useAuth';
import {
    EmitterWebhookEventName,
    GetWorkflowsResponse,
    PaginationCursor,
    ProjectionType,
    StreamEvent,
    WorkflowJob,
    WorkflowRunWithRelations,
    WorkflowsRequestParameters,
    WSToken,
} from '@common/types';
import {defineStore} from 'pinia';
import {reactive, ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;
const WS_ENDPOINT = import.meta.env.VITE_WEBSOCKET_API_ENDPOINT;

export const useWorkflowsStore = defineStore('workflows', () => {
    const {fetchWithAuth} = useAuth();
    const workflowsArray = ref<WorkflowRunWithRelations[]>([]);

    const isLoading = ref(false);
    const hasMore = ref(true);
    let ws: WebSocket | null = null;
    let tokenRenewalTimer: ReturnType<typeof setTimeout> | null = null;
    let cursor: PaginationCursor | undefined;

    const fetchWebSocketToken = async (): Promise<string> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/auth/ws-token`);

        if (!response.ok) {
            throw new Error(`Failed to fetch WebSocket token: ${response.status}`);
        }

        const data = await response.json();
        return data.token;
    };

    const getTokenExpiry = (token: string): number => {
        try {
            const [payloadEncoded] = token.split('.');
            const payloadJson = atob(payloadEncoded.replace(/-/g, '+').replace(/_/g, '/'));
            const payload = JSON.parse(payloadJson) as WSToken;
            return payload.exp;
        } catch (error) {
            console.error('Failed to parse token expiry', error);
            return 0;
        }
    };

    const scheduleTokenRenewal = (token: string) => {
        // Clear any existing renewal timer
        if (tokenRenewalTimer) {
            clearTimeout(tokenRenewalTimer);
            tokenRenewalTimer = null;
        }

        const expiryTime = getTokenExpiry(token);
        if (!expiryTime) {
            console.warn('Could not determine token expiry, skipping renewal schedule');
            return;
        }

        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = expiryTime - now;

        // Renew 30 seconds before expiry
        const renewalDelay = Math.max(0, (timeUntilExpiry - 30) * 1000);

        tokenRenewalTimer = setTimeout(async () => {
            try {
                // Store old connection to close after new one is established
                const oldWs = ws;
                ws = null; // Allow new connection to be created

                await connectToWebSocket();

                // Close old connection after new one is established
                if (oldWs && oldWs.readyState === WebSocket.OPEN) {
                    setTimeout(() => {
                        oldWs.onclose = null; // Prevent old handler from interfering
                        oldWs.close(1000, 'Token renewal');
                    }, 3000);
                }
            } catch (error) {
                console.error('Failed to renew WebSocket token', error);
                // Attempt reconnection after a delay
                setTimeout(() => connectToWebSocket(), 5000);
            }
        }, renewalDelay);
    };

    const connectToWebSocket = async (): Promise<void> => {
        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
            return;
        }

        if (!WS_ENDPOINT) {
            console.warn('WebSocket endpoint not configured');
            return;
        }

        try {
            const token = await fetchWebSocketToken();

            scheduleTokenRenewal(token);

            // Connect with token as query parameter
            const wsUrl = `${WS_ENDPOINT}?token=${encodeURIComponent(token)}`;
            const newWs = new WebSocket(wsUrl);

            // Wait for the connection to be established
            await new Promise<void>((resolve, reject) => {
                newWs.onopen = () => {
                    resolve();
                };

                newWs.onerror = (error) => {
                    console.error('WebSocket error', error);
                    reject(error);
                };
            });

            // Connection is now open, assign it and set up remaining handlers
            ws = newWs;

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data) as StreamEvent<WorkflowRunWithRelations | WorkflowJob>;
                    handleWorkflow(message.eventType, message.payload);
                } catch (error) {
                    console.error('Failed to parse WebSocket message', error);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error', error);
            };

            ws.onclose = (event) => {
                console.log('WebSocket disconnected', event.code, event.reason);
                ws = null;

                // Clear renewal timer on disconnect
                if (tokenRenewalTimer) {
                    clearTimeout(tokenRenewalTimer);
                    tokenRenewalTimer = null;
                }

                // Attempt to reconnect after a delay if not a normal or intentional closure
                // Code 1000 is normal closure, including our token renewal closure
                if (event.code !== 1000) {
                    setTimeout(() => {
                        connectToWebSocket();
                    }, 5000);
                }
            };
        } catch (error) {
            console.error('Failed to connect to WebSocket', error);
            throw error;
        }
    };

    const getJobs = async (params?: WorkflowsRequestParameters) => {
        isLoading.value = true;

        const queryParams = new URLSearchParams();
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams.append(key, String(value));
            }
        });

        if (cursor) {
            queryParams.append('cursor', JSON.stringify(cursor));
        }

        const response = await fetchWithAuth(`${API_ENDPOINT}/workflows?${queryParams.toString()}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch workflows: ${response.status}`);
        }

        const data = (await response.json()) as GetWorkflowsResponse;

        cursor = data.cursor;
        if (!cursor) {
            hasMore.value = false;
        }

        return data.items;
    };

    const handleListWorkflows = async () => {
        if (!hasMore.value || isLoading.value) return;

        workflowsArray.value = await getJobs({limit: 100, projection: ProjectionType.minimal});
        isLoading.value = false;
    };

    const handleWorkflow = (eventType: EmitterWebhookEventName, workflow: WorkflowRunWithRelations | WorkflowJob) => {
        switch (eventType) {
            case 'workflow_job': {
                const workflowJob = workflow as WorkflowJob;
                const wr = workflowsArray.value.find((run) => run.id === workflowJob.runId);
                if (!wr) {
                    const run: WorkflowRunWithRelations = reactive({
                        id: workflowJob.id,
                        integrationId: workflowJob.integrationId,
                    }) as unknown as WorkflowRunWithRelations;
                    workflowsArray.value = [run, ...workflowsArray.value];
                    break;
                }

                const jobIndex = wr.workflowJobs.findIndex((job) => job.id === workflowJob.id);
                if (jobIndex !== -1) {
                    wr.workflowJobs[jobIndex] = workflowJob;
                    return;
                }
                wr.workflowJobs = [workflowJob, ...wr.workflowJobs];
                break;
            }
            case 'workflow_run': {
                const workflowRun = workflow as WorkflowRunWithRelations;
                const workflowRunIndex = workflowsArray.value.findIndex((run) => run.id === workflowRun.id);
                if (workflowRunIndex !== -1) {
                    const existingWorkflowRun = workflowsArray.value[workflowRunIndex];
                    workflowsArray.value[workflowRunIndex] = {
                        ...workflowRun,
                        workflowJobs: existingWorkflowRun.workflowJobs,
                    };
                    break;
                }

                workflowsArray.value = [workflowRun, ...workflowsArray.value];
                break;
            }
            default:
                console.warn(`Unsupported workflow event type: ${eventType}`);
        }
    };

    const initializeStore = async () => {
        // Reset pagination state
        cursor = undefined;
        hasMore.value = true;

        // Connect to WebSocket for real-time updates
        if (WS_ENDPOINT) {
            await connectToWebSocket();
        }

        await handleListWorkflows();
    };

    return {
        workflows: workflowsArray,
        isLoading,
        hasMore,
        initializeStore,
        handleListWorkflows,
    };
});
