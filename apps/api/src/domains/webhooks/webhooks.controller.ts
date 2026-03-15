import {sendWorkflowJobAlerts} from '@/domains/alerting/alerting.controller';
import {insertEvent} from '@/domains/webhooks/importers/index';
import {deleteConnection, getConnections} from '@/shared/clients/websocket.client';
import config from '@/shared/config';
import {ensureHttpError} from '@/shared/errors';
import {getLogger} from '@/shared/logger';
import {
    ApiGatewayManagementApiClient,
    ApiGatewayManagementApiServiceException,
    GoneException,
    PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {EventPayloadMap, StreamEvent, WorkflowJobEvent} from '@gitgazer/db/types';
import type {EmitterWebhookEventName} from '@octokit/webhooks';

let apiClient: ApiGatewayManagementApiClient | null = null;

const getApiClient = (): ApiGatewayManagementApiClient => {
    if (!apiClient) {
        const {apiDomainName, apiStage} = config.get('websocket');
        apiClient = new ApiGatewayManagementApiClient({
            region: process.env.AWS_REGION,
            endpoint: `https://${apiDomainName}/${apiStage}`,
        });
    }
    return apiClient;
};

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
        throw ensureHttpError(error);
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
        promises.push(getApiClient().send(apiCommand));
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
