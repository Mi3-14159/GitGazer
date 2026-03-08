import {deleteConnection, getConnections} from '@/clients/websocket-connections';
import {sendWorkflowJobAlerts} from '@/controllers/alerting';
import {insertEvent} from '@/controllers/imports/index';
import {getLogger} from '@/logger';
import {InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {
    ApiGatewayManagementApiClient,
    ApiGatewayManagementApiServiceException,
    GoneException,
    PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {EventPayloadMap, StreamEvent, WorkflowJobEvent} from '@gitgazer/db/types';
import type {EmitterWebhookEventName} from '@octokit/webhooks';

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

export const handleEvent = async <T extends EmitterWebhookEventName & keyof EventPayloadMap>(
    integrationId: string,
    eventType: T,
    event: EventPayloadMap[T],
): Promise<void> => {
    try {
        const result = await insertEvent(integrationId, eventType, event);

        if (eventType === 'workflow_job') {
            await postToConnections({
                eventType,
                integrationId,
                payload: result,
            });
            await sendWorkflowJobAlerts(integrationId, event as unknown as WorkflowJobEvent);
        } else if (eventType === 'workflow_run') {
            await postToConnections({
                eventType,
                integrationId,
                payload: result,
            });
        }
    } catch (error) {
        getLogger().error(`Error handling event: ${error instanceof Error ? error.stack : JSON.stringify(error)}`);
        throw new InternalServerError();
    }
};

const postToConnections = async <T>(params: StreamEvent<T>) => {
    const logger = getLogger();
    const connections = await getConnections(params.integrationId);

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
            logger.debug(`Successfully sent message to ${connection.connectionId}: ${JSON.stringify(result.value)}`);
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
