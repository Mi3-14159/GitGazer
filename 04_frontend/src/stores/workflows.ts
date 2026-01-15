import {
    isWorkflowJobEvent,
    isWorkflowRunEvent,
    ProjectionType,
    Workflow,
    WorkflowsRequestParameters,
    WorkflowsResponse,
    WorkflowType,
} from '@common/types';
import type {WorkflowJobEvent, WorkflowRunEvent, WebhookEvent} from '@common/types';
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

    const isLoading = ref(false);
    let ws: WebSocket | null = null;
    const lastEvaluatedKeys = new Map<string, any>();

    const connectToIamWebSocket = async () => {
        // WebSocket temporarily disabled during Amplify removal
        // TODO: Implement cookie-based WebSocket authentication
        console.warn('WebSocket connection temporarily disabled');
        return null;
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
        // Skip WebSocket connection check for now
        await connectToIamWebSocket();
        await handleListWorkflows();
    };

    return {
        workflows: workflowsArray,
        isLoading,
        initializeStore,
        handleListWorkflows,
    };
});
