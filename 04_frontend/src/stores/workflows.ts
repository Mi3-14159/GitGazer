import {
    isWorkflowJobEvent,
    isWorkflowRunEvent,
    ProjectionType,
    Workflow,
    WorkflowsRequestParameters,
    WorkflowsResponse,
    WorkflowType,
} from '@common/types';
import type {WorkflowJobEvent, WorkflowRunEvent, WebhookEvent, StreamWorkflowEvent} from '@common/types';
import * as api from '@/api/client';
import {defineStore} from 'pinia';
import {reactive, ref} from 'vue';

export type WorkflowGroup = {
    run: Workflow<WorkflowRunEvent>;
    jobs: Map<string, Workflow<WorkflowJobEvent>>;
};

export const useWorkflowsStore = defineStore('workflows', () => {
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
    const lastEvaluatedKeys = new Map<string, any>();

    /**
     * Connect to WebSocket with cookie-based authentication
     * Since cookies are httpOnly, we pass them via the initial HTTP upgrade request
     */
    const connectToWebSocket = async () => {
        try {
            // Get access token from cookie-based auth check
            // The WebSocket will validate via query parameter since we can't send cookies directly
            const response = await fetch(`${import.meta.env.VITE_REST_API_ENDPOINT}/auth/session`, {
                credentials: 'include',
            });

            if (!response.ok) {
                console.error('Not authenticated for WebSocket connection');
                return null;
            }

            const websocketUrl = new URL(import.meta.env.VITE_WEBSOCKET_API_ENDPOINT);
            
            // For cookie-based auth, the browser will automatically send cookies with the WebSocket upgrade request
            // However, API Gateway WebSocket doesn't support cookie-based auth directly
            // We need to use IAM auth or custom authorizer
            // For now, we'll keep WebSocket disabled until infrastructure is updated
            
            console.warn('WebSocket connection requires infrastructure update for cookie-based auth');
            console.info('Alternative: Use polling for real-time updates');
            
            return null;

            // TODO: Uncomment when WebSocket infrastructure supports cookie auth
            /*
            ws = new WebSocket(websocketUrl.toString());

            ws.onopen = () => console.info('WebSocket connected');
            ws.onmessage = (event) => {
                const gitgazerEvent = JSON.parse(event.data) as StreamWorkflowEvent<WebhookEvent>;
                handleWorkflow(gitgazerEvent.payload);
                sortWorkflows();
            };
            ws.onerror = (error) => console.error('WebSocket error:', error);
            ws.onclose = (event) => {
                console.info(`WebSocket closed: ${event.code} ${event.reason}`);
                switch (event.code) {
                    case 1000: // Normal Closure
                    case 1001: // Going Away
                    case 1006: // Abnormal Closure
                    case 1011: // Internal Error
                    case 1012: // Service Restart
                    case 1013: // Try Again Later
                        initializeStore();
                        break;
                    default:
                        break;
                }
            };

            return ws;
            */
        } catch (error) {
            console.error('Error connecting to WebSocket:', error);
            return null;
        }
    };

    const getJobs = async (params?: WorkflowsRequestParameters) => {
        isLoading.value = true;

        const queryParams: Record<string, string> = {};
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams[key] = String(value);
            }
        });

        if (lastEvaluatedKeys.size > 0) {
            queryParams['exclusiveStartKeys'] = JSON.stringify(Array.from(lastEvaluatedKeys.values()));
        }

        // Build query string
        const queryString = new URLSearchParams(queryParams).toString();
        const path = `/workflows${queryString ? `?${queryString}` : ''}`;

        const response = await api.get<WorkflowsResponse<Workflow<WebhookEvent>>>(path);
        const events = response.data;

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
        // Skip WebSocket for now - requires infrastructure update
        await connectToWebSocket();
        await handleListWorkflows();
    };

    return {
        workflows: workflowsArray,
        isLoading,
        initializeStore,
        handleListWorkflows,
    };
});
