import {useAuth} from '@/composables/useAuth';
import {Sha256} from '@aws-crypto/sha256-js';
import {
    isWorkflowJobEvent,
    isWorkflowRunEvent,
    Job,
    JobRequestParameters,
    JobsResponse,
    JobType,
    ProjectionType,
    StreamJobEvent,
    WebhookEvent,
    WorkflowJobEvent,
    WorkflowRunEvent,
} from '@common/types';
import {HttpRequest} from '@smithy/protocol-http';
import {SignatureV4} from '@smithy/signature-v4';
import {get} from 'aws-amplify/api';
import {defineStore} from 'pinia';
import {ref} from 'vue';

type WorkflowGroup = {
    run: Job<WorkflowRunEvent>;
    jobs: Map<string, Job<WorkflowJobEvent>>;
};

export const useJobsStore = defineStore('jobs', () => {
    const {getSession} = useAuth();

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

    const connectToIamWebSocket = async () => {
        // Get AWS credentials from Cognito Identity Pool
        const session = await getSession();
        const creds = session.credentials;
        if (!creds?.accessKeyId) {
            throw new Error('No AWS credentials. Please sign in.');
        }

        const websocketUrl = new URL(import.meta.env.VITE_WEBSOCKET_API_ENDPOINT);

        // Create HTTP request for signing
        const request = new HttpRequest({
            protocol: 'https:',
            hostname: websocketUrl.hostname,
            method: 'GET',
            path: websocketUrl.pathname,
            query: {
                idToken: session.tokens?.idToken?.toString() ?? '',
            },
            headers: {host: websocketUrl.hostname},
        });

        // Sign the request
        const signer = new SignatureV4({
            service: 'execute-api',
            region: import.meta.env.VITE_WEBSOCKET_API_REGION,
            credentials: creds,
            sha256: Sha256,
        });

        const signedRequest = await signer.presign(request);

        // Build final WebSocket URL with signed parameters
        if (signedRequest.query) {
            Object.entries(signedRequest.query).forEach(([key, value]) => {
                const values = Array.isArray(value) ? value : [value];
                values.forEach((v) => websocketUrl.searchParams.append(key, String(v)));
            });
        }

        ws = new WebSocket(websocketUrl.toString());

        ws.onopen = () => console.info('WebSocket connected');
        ws.onmessage = (event) => {
            const gitgazerEvent = JSON.parse(event.data) as StreamJobEvent<WebhookEvent>;
            handleWorkflow(gitgazerEvent.payload);
            sortWorkflows();
        };
        ws.onerror = (error) => console.error('WebSocket error:', error);
        ws.onclose = (event) => {
            console.info(`WebSocket closed: ${event.code} ${event.reason}`);
            switch (event.code) {
                // Try to reconnect
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
    };

    const getJobs = async (params?: JobRequestParameters) => {
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

        const restOperation = get({
            apiName: 'api',
            path: '/jobs',
            options: {
                queryParams,
            },
        });

        const {body} = await restOperation.response;
        const events = (await body.json()) as unknown as JobsResponse<Job<WebhookEvent>>;

        events.forEach((event) => {
            if (event.lastEvaluatedKey) {
                lastEvaluatedKeys.set(event.items[0].integrationId, event.lastEvaluatedKey);
            }
        });

        return events.flatMap((event) => event.items);
    };

    const handleListJobs = async () => {
        const response = await getJobs({limit: 100, projection: ProjectionType.minimal});

        response.forEach((workflow) => {
            handleWorkflow(workflow, false);
        });

        workflowsArray.value = Array.from(workflows.values()).sort(compareWorkflows);
        isLoading.value = false;
    };

    const ensureWorkflowGroup = (runId: string, integrationId: string, addToArray: boolean) => {
        if (!workflows.has(runId)) {
            const group: WorkflowGroup = {
                run: {
                    id: runId,
                    integrationId,
                    event_type: JobType.WORKFLOW_RUN,
                } as Job<WorkflowRunEvent>,
                jobs: new Map(),
            };
            workflows.set(runId, group);
            if (addToArray) {
                workflowsArray.value.push(group);
            }
        }
        return workflows.get(runId)!;
    };

    const handleWorkflow = (workflow: Job<WebhookEvent>, addToArray = true) => {
        if (isWorkflowJobEvent(workflow.workflow_event)) {
            const runId = String(workflow.workflow_event.workflow_job.run_id);
            const group = ensureWorkflowGroup(runId, workflow.integrationId, addToArray);
            group.jobs.set(workflow.id, workflow as Job<WorkflowJobEvent>);
        } else if (isWorkflowRunEvent(workflow.workflow_event)) {
            const runId = workflow.id;
            const group = ensureWorkflowGroup(runId, workflow.integrationId, addToArray);
            group.run = workflow as Job<WorkflowRunEvent>;
        }
    };

    const initializeStore = async () => {
        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
            return;
        }

        await connectToIamWebSocket();
        await handleListJobs();
    };

    return {
        workflows: workflowsArray,
        isLoading,
        initializeStore,
        handleListJobs,
    };
});
