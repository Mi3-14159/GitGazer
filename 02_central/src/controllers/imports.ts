import {deleteConnection, getConnections, putEvent} from '@/clients/dynamodb';
import {insertEvent} from '@/controllers/imports/index';
import {getLogger} from '@/logger';
import {BadRequestError, InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {
    ApiGatewayManagementApiClient,
    ApiGatewayManagementApiServiceException,
    GoneException,
    PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {Event, EventPayloadMap, StreamEvent} from '@common/types';
import type {EmitterWebhookEventName} from '@octokit/webhooks';

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

export async function handleEvent<T extends EmitterWebhookEventName & keyof EventPayloadMap>(
    integrationId: string,
    eventType: T,
    event: EventPayloadMap[T],
): Promise<void> {
    let event_type_group: string | undefined = undefined;
    if (['workflow_job', 'workflow_run'].includes(eventType)) {
        event_type_group = 'workflow';
    }

    const ggEvent: Omit<Event<EventPayloadMap[T]>, 'created_at'> = {
        integrationId,
        id: getEventId(eventType, event),
        expire_at: expireInSec ? Math.floor(new Date().getTime() / 1000) + expireInSec : undefined,
        event_type: eventType,
        event_type_group,
        event: event,
    };

    const promises = [putEvent(ggEvent), insertEvent(integrationId, event)];
    const [ddbResponse, rdsResponse] = await Promise.allSettled(promises);

    if (ddbResponse.status === 'rejected') {
        getLogger().error(`Error writing event to DynamoDB: ${ddbResponse.reason}`);
        throw new InternalServerError();
    }

    if (!ddbResponse.value) {
        getLogger().error(`Failed to write event to DynamoDB for unknown reasons, return value is falsy`);
        throw new InternalServerError();
    }

    if (rdsResponse.status === 'rejected') {
        getLogger().error(`Error writing event to RDS: ${rdsResponse.reason}`);
    }

    if (eventType === 'workflow_job' || eventType === 'workflow_run') {
        await postToConnections({
            eventType,
            payload: ddbResponse.value,
        });
    }
}

export const getEventId = <T extends EmitterWebhookEventName & keyof EventPayloadMap>(eventType: T, event: EventPayloadMap[T]): string => {
    const eventData = event as any;

    if (!(eventType in eventData) || !eventData[eventType] || typeof eventData[eventType] !== 'object') {
        throw new BadRequestError(`Event payload does not contain expected property for event type ${eventType}`);
    }

    if ('id' in eventData[eventType] === false) {
        throw new BadRequestError(`Event payload for event type ${eventType} does not contain an 'id' property`);
    }

    return `${eventType}/${eventData[eventType].id}`;
};

const postToConnections = async <T extends keyof EventPayloadMap>(params: StreamEvent<T>) => {
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
