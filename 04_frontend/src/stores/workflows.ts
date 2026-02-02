import {useAuth} from '@/composables/useAuth';
import {
    isWorkflowJobEvent,
    isWorkflowRunEvent,
    ProjectionType,
    StreamWorkflowEvent,
    WebhookEvent,
    Workflow,
    WorkflowJobEvent,
    WorkflowRunEvent,
    WorkflowsRequestParameters,
    WorkflowsResponse,
    WorkflowType,
    WSToken,
} from '@common/types';
import {defineStore} from 'pinia';
import {reactive, ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;
const WS_ENDPOINT = import.meta.env.VITE_WEBSOCKET_API_ENDPOINT;

export type WorkflowGroup = {
    run: Workflow<WorkflowRunEvent>;
    jobs: Map<string, Workflow<WorkflowJobEvent>>;
};

export const useWorkflowsStore = defineStore('workflows', () => {
    const {fetchWithAuth} = useAuth();
    const workflows = new Map<string, WorkflowGroup>();
    const workflowsArray = ref<WorkflowGroup[]>([]);

    const compareWorkflows = (a: WorkflowGroup, b: WorkflowGroup) => {
        const timeA = a.run.created_at ? new Date(a.run.created_at).getTime() : 0;
        const timeB = b.run.created_at ? new Date(b.run.created_at).getTime() : 0;
        return timeB - timeA;
    };

    const sortWorkflows = () => {
        workflowsArray.value.sort(compareWorkflows);
    };

    const isLoading = ref(false);
    let ws: WebSocket | null = null;
    let tokenRenewalTimer: ReturnType<typeof setTimeout> | null = null;
    const lastEvaluatedKeys = new Map<string, any>();

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
                    const message = JSON.parse(event.data) as StreamWorkflowEvent<WebhookEvent>;
                    handleWorkflow(message.payload, true);
                    sortWorkflows();
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

        if (lastEvaluatedKeys.size > 0) {
            queryParams.append('exclusiveStartKeys', JSON.stringify(Array.from(lastEvaluatedKeys.values())));
        }

        const response = await fetchWithAuth(`${API_ENDPOINT}/workflows?${queryParams.toString()}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch workflows: ${response.status}`);
        }

        const events = (await response.json()) as unknown as WorkflowsResponse<Workflow<WebhookEvent>>;

        events.forEach((event) => {
            if (event.lastEvaluatedKey) {
                lastEvaluatedKeys.set(event.items[0].integrationId, event.lastEvaluatedKey);
            }
        });

        return events.flatMap((event) => event.items);
    };

    const handleListWorkflows = async () => {
        const response = await getJobs({limit: 100, projection: ProjectionType.minimal});

        response.forEach((workflow) => {
            handleWorkflow(workflow, false);
        });

        workflowsArray.value = Array.from(workflows.values())
            .filter((group) => group.run.workflow_event)
            .sort(compareWorkflows);
        isLoading.value = false;
    };

    const ensureWorkflowGroup = (runId: string, integrationId: string, addToArray: boolean) => {
        if (!workflows.has(runId)) {
            const group: WorkflowGroup = reactive({
                run: {
                    id: runId,
                    integrationId,
                    event_type: WorkflowType.RUN,
                } as Workflow<WorkflowRunEvent>,
                jobs: new Map(),
            });
            workflows.set(runId, group);
            if (addToArray) {
                workflowsArray.value.push(group);
            }
        }
        return workflows.get(runId)!;
    };

    const handleWorkflow = (workflow: Workflow<WebhookEvent>, addToArray = true) => {
        if (isWorkflowJobEvent(workflow.workflow_event)) {
            const runId = String(workflow.workflow_event.workflow_job.run_id);
            const group = ensureWorkflowGroup(runId, workflow.integrationId, addToArray);
            group.jobs.set(workflow.id, workflow as Workflow<WorkflowJobEvent>);
        } else if (isWorkflowRunEvent(workflow.workflow_event)) {
            const runId = workflow.id;
            const group = ensureWorkflowGroup(runId, workflow.integrationId, addToArray);
            group.run = workflow as Workflow<WorkflowRunEvent>;
        }
    };

    const initializeStore = async () => {
        // Connect to WebSocket for real-time updates
        if (WS_ENDPOINT) {
            await connectToWebSocket();
        }

        await handleListWorkflows();
    };

    return {
        workflows: workflowsArray,
        isLoading,
        initializeStore,
        handleListWorkflows,
    };
});
