import {useAuth} from '@/composables/useAuth';
import {Sha256} from '@aws-crypto/sha256-js';
import {HttpRequest} from '@aws-sdk/protocol-http';
import {SignatureV4} from '@aws-sdk/signature-v4';
import {Job, JobRequestParameters, ProjectionType, StreamJobEvent} from '@common/types';
import type {WebhookEvent, WorkflowJobEvent} from '@octokit/webhooks-types';
import {get} from 'aws-amplify/api';
import {defineStore} from 'pinia';
import {computed, reactive, ref} from 'vue';

export const useJobsStore = defineStore('jobs', () => {
    const {getSession} = useAuth();

    const uniqueJobs = reactive(new Map<string, Job<WorkflowJobEvent>>());
    const isLoading = ref(false);
    let ws: WebSocket | null = null;

    const jobs = computed(() => {
        return Array.from(uniqueJobs.values());
    });

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
            if (isWorkflowJobEvent(gitgazerEvent.payload.workflow_event)) {
                const workflowJobEvent = gitgazerEvent.payload as Job<WorkflowJobEvent>;
                formatJobTime(workflowJobEvent);
                uniqueJobs.set(workflowJobEvent.id, workflowJobEvent);
            }
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

    const formatJobTime = (job: Job<WorkflowJobEvent>) => {
        const date = new Date(job.created_at);
        job.created_at = date.toLocaleString();
    };

    const getJobs = async (params?: JobRequestParameters) => {
        isLoading.value = true;

        const queryParams: Record<string, string> = {};
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams[key] = String(value);
            }
        });

        const restOperation = get({
            apiName: 'api',
            path: '/jobs',
            options: {
                queryParams,
            },
        });

        const {body} = await restOperation.response;
        const events = (await body.json()) as unknown as Job<WebhookEvent>[];
        const jobs = events.filter((e): e is Job<WorkflowJobEvent> => isWorkflowJobEvent(e.workflow_event));

        isLoading.value = false;

        return jobs;
    };

    const handleListJobs = async () => {
        const response = await getJobs({limit: 100, projection: ProjectionType.minimal});

        response.forEach((job: Job<WorkflowJobEvent>) => {
            formatJobTime(job);
            uniqueJobs.set(job.id, job);
        });
    };

    const initializeStore = async () => {
        await handleListJobs();

        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
            return;
        }

        await connectToIamWebSocket();
    };

    const isWorkflowJobEvent = (event: WebhookEvent): event is WorkflowJobEvent => {
        return (event as WorkflowJobEvent).workflow_job !== undefined && (event as WorkflowJobEvent).workflow_job.id !== undefined;
    };

    return {
        jobs,
        isLoading,
        initializeStore,
    };
});
