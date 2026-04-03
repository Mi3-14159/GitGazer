import {sendWebhookEvent} from '@/shared/clients/sqs.client';
import {deleteConnection, getConnections} from '@/shared/clients/websocket.client';
import config from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {
    ApiGatewayManagementApiClient,
    ApiGatewayManagementApiServiceException,
    GoneException,
    PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {EventPayloadMap, StreamEvent, type WebSocketChannel} from '@gitgazer/db/types';
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
    const queueUrl = config.get('webhookQueueUrl');
    await sendWebhookEvent(queueUrl, {integrationId, eventType, payload: event});
};

export const postToConnections = async <T>(channel: WebSocketChannel, params: StreamEvent<T>) => {
    const logger = getLogger();
    const connections = await getConnections(params.integrationId, channel);

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
