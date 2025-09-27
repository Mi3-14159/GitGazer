import {deleteConnection, getConnections, putJob} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {
    ApiGatewayManagementApiClient,
    ApiGatewayManagementApiServiceException,
    GoneException,
    PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {Job, StreamJobEvent, StreamJobEventType} from '@common/types';
import {WorkflowJobEvent} from '@octokit/webhooks-types';

const _expireInSec = process.env.EXPIRE_IN_SEC;
if (!_expireInSec) {
    throw new Error('Missing EXPIRE_IN_SEC environment variable');
}
const expireInSec = parseInt(_expireInSec);

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

export const createWorkflowJob = async (integrationId: string, event: WorkflowJobEvent): Promise<Job<WorkflowJobEvent>> => {
    const job: Job<WorkflowJobEvent> = {
        integrationId,
        job_id: event.workflow_job.id,
        created_at: event.workflow_job.created_at,
        expire_at: Math.floor(new Date().getTime() / 1000) + expireInSec,
        workflow_job_event: event,
    };

    const response = await putJob(job);
    await postToConnections({eventType: StreamJobEventType.JOB, payload: job});
    return response;
};

const postToConnections = async (params: StreamJobEvent<WorkflowJobEvent>) => {
    const logger = getLogger();
    const connections = await getConnections();

    const promises = [];
    for (const connectionId of connections) {
        const apiCommand = new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: JSON.stringify(params),
        });
        promises.push(apiClient.send(apiCommand));
    }

    const results = await Promise.allSettled(promises);
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const connectionId = connections[i];
        if (result.status === 'fulfilled') {
            logger.info(`Successfully sent message to ${connectionId}: ${JSON.stringify(result.value)}`);
        } else {
            await handlePostToConnectionError(connectionId, result.reason);
        }
    }
};

const handlePostToConnectionError = async (connectionId: string, error: any) => {
    const logger = getLogger();

    if (error instanceof GoneException) {
        logger.warn(`Connection ${connectionId} is gone, skipping.`);
        await deleteConnection(connectionId);
    } else if (error instanceof ApiGatewayManagementApiServiceException) {
        logger.info(`API Gateway Service Exception: ${error.message}, status code: ${error.$metadata.httpStatusCode}`);
        await deleteConnection(connectionId);
    } else {
        throw error;
    }
};
