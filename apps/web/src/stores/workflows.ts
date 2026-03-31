import {useAuth} from '@/composables/useAuth';
import {useWebSocket} from '@/composables/useWebSocket';
import {
    EmitterWebhookEventName,
    GetWorkflowsResponse,
    PaginationCursor,
    StreamEvent,
    WorkflowFilters,
    WorkflowJob,
    WorkflowRunWithRelations,
    WorkflowsRequestParameters,
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
    let cursor: PaginationCursor | undefined;
    let activeFilters: WorkflowFilters = {};
    let fetchAbortController: AbortController | null = null;

    const fetchWebSocketToken = async (): Promise<string> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/auth/ws-token`);

        if (!response.ok) {
            throw new Error(`Failed to fetch WebSocket token: ${response.status}`);
        }

        const data = await response.json();
        return data.token;
    };

    const {connect: connectToWebSocket} = useWebSocket({
        endpoint: WS_ENDPOINT,
        channel: 'workflows',
        fetchToken: fetchWebSocketToken,
        onMessage: (data) => {
            const message = data as StreamEvent<WorkflowRunWithRelations | WorkflowJob>;
            handleWorkflow(message.eventType, message.payload);
        },
    });

    const getJobs = async (params?: WorkflowsRequestParameters, signal?: AbortSignal) => {
        isLoading.value = true;
        try {
            const queryParams = new URLSearchParams();
            Object.entries(params ?? {}).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryParams.append(key, String(value));
                }
            });

            // Append active filters as comma-separated values
            for (const [column, values] of Object.entries(activeFilters)) {
                if (column === 'created_from' || column === 'created_to' || column === 'window') {
                    if (typeof values === 'string' && values.length > 0) {
                        queryParams.append(column, values);
                    }
                    continue;
                }
                if (Array.isArray(values) && values.length > 0) {
                    queryParams.append(column, values.join(','));
                }
            }

            if (cursor) {
                queryParams.append('cursor', JSON.stringify(cursor));
            }

            const response = await fetchWithAuth(`${API_ENDPOINT}/workflows?${queryParams.toString()}`, {signal});

            if (!response.ok) {
                throw new Error(`Failed to fetch workflows: ${response.status}`);
            }

            const data = (await response.json()) as GetWorkflowsResponse;

            cursor = data.cursor;
            if (!cursor) {
                hasMore.value = false;
            }

            return data.items;
        } finally {
            if (!signal?.aborted) {
                isLoading.value = false;
            }
        }
    };

    const handleListWorkflows = async (signal?: AbortSignal) => {
        if (!hasMore.value || isLoading.value) return;

        const items = await getJobs({limit: 100}, signal);
        if (signal?.aborted) return;
        workflowsArray.value.push(...items);
    };

    const handleWorkflow = (eventType: EmitterWebhookEventName, workflow: WorkflowRunWithRelations | WorkflowJob) => {
        switch (eventType) {
            case 'workflow_job': {
                const workflowJob = workflow as WorkflowJob;
                const wr = workflowsArray.value.find((run) => run.id === workflowJob.runId);
                if (!wr) {
                    const run: WorkflowRunWithRelations = {
                        id: workflowJob.id,
                        integrationId: workflowJob.integrationId,
                    } as unknown as WorkflowRunWithRelations;
                    workflowsArray.value = [reactive(run), ...workflowsArray.value];
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

    const setFilters = async (filters: WorkflowFilters) => {
        fetchAbortController?.abort();
        const controller = new AbortController();
        fetchAbortController = controller;

        activeFilters = filters;
        cursor = undefined;
        hasMore.value = true;
        workflowsArray.value = [];
        try {
            await handleListWorkflows(controller.signal);
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            throw e;
        }
    };

    const initializeStore = async (initialFilters?: WorkflowFilters) => {
        fetchAbortController?.abort();
        const controller = new AbortController();
        fetchAbortController = controller;

        // Reset pagination state
        cursor = undefined;
        hasMore.value = true;
        if (initialFilters) {
            activeFilters = initialFilters;
        }

        // Connect to WebSocket for real-time updates
        if (WS_ENDPOINT) {
            await connectToWebSocket();
        }

        try {
            await handleListWorkflows(controller.signal);
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            throw e;
        }
    };

    return {
        workflows: workflowsArray,
        isLoading,
        hasMore,
        initializeStore,
        handleListWorkflows,
        setFilters,
    };
});
