import {useAuth} from '@/composables/useAuth';
import {Sha256} from '@aws-crypto/sha256-js';
import {HttpRequest} from '@aws-sdk/protocol-http';
import {SignatureV4} from '@aws-sdk/signature-v4';
import {Job, JobRequestParameters, ProjectionType, StreamJobEvent} from '@common/types';
import type {WorkflowJobEvent} from '@octokit/webhooks-types';
import {get} from 'aws-amplify/api';
import {defineStore} from 'pinia';
import {computed, reactive, ref} from 'vue';

export const useJobsStore = defineStore('jobs', () => {
    const {getSession} = useAuth();

    const uniqueJobs = reactive(new Map<number, Job<WorkflowJobEvent>>());
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
            const gitgazerEvent = JSON.parse(event.data) as StreamJobEvent<WorkflowJobEvent>;

            formatJobTime(gitgazerEvent.payload);
            uniqueJobs.set(gitgazerEvent.payload.job_id, gitgazerEvent.payload);
        };
        ws.onerror = (error) => console.error('WebSocket error:', error);
        ws.onclose = (event) => {
            console.info(`WebSocket closed: ${event.code} ${event.reason}`);
            switch (event.code) {
                case 1006: // Abnormal Closure - Try to reconnect
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
        const jobs = (await body.json()) as unknown as Job<WorkflowJobEvent>[];
        isLoading.value = false;

        return jobs;
    };

    const handleListJobs = async () => {
        const response = await getJobs({limit: 100, projection: ProjectionType.minimal});

        response.forEach((job: Job<WorkflowJobEvent>) => {
            formatJobTime(job);
            uniqueJobs.set(job.job_id, job);
        });
    };

    const initializeStore = async () => {
        await handleListJobs();

        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
            return;
        }

        await connectToIamWebSocket();
    };

    return {
        jobs,
        isLoading,
        initializeStore,
    };
});
