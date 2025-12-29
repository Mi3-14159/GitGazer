import {deleteConnection, getConnections, putJob} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {isWorkflowJobEvent, isWorkflowRunEvent} from '@/types';
import {
    ApiGatewayManagementApiClient,
    ApiGatewayManagementApiServiceException,
    GoneException,
    PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {Job, JobType, StreamJobEvent, StreamJobEventType, WorkflowEvent} from '@common/types';

const expireInSecString = process.env.EXPIRE_IN_SEC;
const expireInSec = parseInt(expireInSecString ?? '') || undefined;

const websocketApiDomain = process.env.WEBSOCKET_API_DOMAIN_NAME;
if (!websocketApiDomain) {
    throw new Error('Missing WEBSOCKET_API_DOMAIN_NAME environment variable');
}

const stage = process.env.WEBSOCKET_API_STAGE;
if (!stage) {
    throw new Error('Missing WEBSOCKET_API_STAGE environment variable');
}

const apiClient = new ApiGatewayManagementApiClient({
    region: process.env.AWS_REGION,
    endpoint: `https://${websocketApiDomain}/${stage}`,
});

export async function createWorkflow<T extends WorkflowEvent<any>>(integrationId: string, event: T): Promise<Job<T>> {
    let job: Job<T>;
    if (isWorkflowJobEvent(event)) {
        job = {
            integrationId,
            id: [event.workflow_job.run_id, event.workflow_job.id].join('/'),
            created_at: event.workflow_job.created_at,
            expire_at: expireInSec ? Math.floor(new Date().getTime() / 1000) + expireInSec : undefined,
            event_type: JobType.WORKFLOW_JOB,
            workflow_event: event,
        };
    } else if (isWorkflowRunEvent(event)) {
        job = {
            integrationId,
            id: `${event.workflow_run.id}`,
            created_at: event.workflow_run.created_at,
            expire_at: expireInSec ? Math.floor(new Date().getTime() / 1000) + expireInSec : undefined,
            event_type: JobType.WORKFLOW_RUN,
            workflow_event: event,
        };
    } else {
        throw new Error('Unsupported event type');
    }

    const response = await putJob(job);
    if (isWorkflowJobEvent(event)) {
        await postToConnections({eventType: StreamJobEventType.JOB, payload: job});
    }
    return response;
}

const postToConnections = async <T extends WorkflowEvent<any>>(params: StreamJobEvent<T>) => {
    const logger = getLogger();
    const connections = await getConnections(params.payload.integrationId);

    const promises = [];
    for (const connection of connections) {
        const apiCommand = new PostToConnectionCommand({
            ConnectionId: connection.connectionId,
            Data: JSON.stringify(params),
        });
        promises.push(apiClient.send(apiCommand));
    }

    const results = await Promise.allSettled(promises);
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const connection = connections[i];
        if (result.status === 'fulfilled') {
            logger.info(`Successfully sent message to ${connection.connectionId}: ${JSON.stringify(result.value)}`);
        } else {
            await handlePostToConnectionError(connection.integrationId, connection.connectionId, result.reason);
        }
    }
};

const handlePostToConnectionError = async (integrationId: string, connectionId: string, error: any) => {
    const logger = getLogger();

    if (error instanceof GoneException) {
        logger.warn(`Connection ${connectionId} is gone, skipping.`);
        await deleteConnection({integrationId, connectionId});
    } else if (error instanceof ApiGatewayManagementApiServiceException) {
        logger.info(`API Gateway Service Exception: ${error.message}, status code: ${error.$metadata.httpStatusCode}`);
        await deleteConnection({integrationId, connectionId});
    } else {
        throw error;
    }
};
