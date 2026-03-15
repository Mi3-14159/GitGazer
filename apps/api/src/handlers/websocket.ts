import config, {loadConfig} from '@/shared/config';
import {db} from '@gitgazer/db/client';
import {WSToken} from '@gitgazer/db/types';
import {wsConnections} from '@gitgazer/db/schema/gitgazer';
import {getLogger} from '@/shared/logger';
import {APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2, Context} from 'aws-lambda';
import {createHmac} from 'crypto';
import {eq} from 'drizzle-orm';

const logger = getLogger();

let initPromise: Promise<void> | null = null;

const init = async (): Promise<void> => {
    await loadConfig();
};

type WebsocketEvent = APIGatewayProxyWebsocketEventV2 & {
    queryStringParameters?: Record<string, string | undefined> | null;
};

const validateWebSocketToken = (token: string): WSToken => {
    const parts = token.split('.');
    if (parts.length !== 2) {
        throw new Error('Invalid token format');
    }

    const [payloadEncoded, signatureEncoded] = parts;

    // Verify signature
    const {clientSecret} = config.get('cognito');
    const expectedSignature = createHmac('sha256', clientSecret).update(payloadEncoded).digest('base64url');

    if (signatureEncoded !== expectedSignature) {
        throw new Error('Invalid token signature');
    }

    // Decode payload
    const payloadJson = Buffer.from(payloadEncoded, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as WSToken;

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
        throw new Error('Token expired');
    }

    // Basic validation
    if (!payload.userId || !payload.integrations || !Array.isArray(payload.integrations)) {
        throw new Error('Invalid token payload');
    }

    return payload;
};

export const handler = async (event: WebsocketEvent, context: Context): Promise<APIGatewayProxyResultV2<string>> => {
    if (!initPromise) {
        initPromise = init();
    }
    await initPromise;

    logger.resetKeys();
    logger.addContext(context);
    logger.logEventIfEnabled(event);

    let result = {};
    switch (event.requestContext.eventType) {
        case 'DISCONNECT':
            result = await onDisconnect(event);
            break;
        case 'CONNECT':
            result = await onConnect(event);
            break;
        default:
            result = {statusCode: 400, body: `Invalid event type: ${event.requestContext.eventType}`};
    }

    return result;
};

const onDisconnect = async (event: WebsocketEvent): Promise<APIGatewayProxyResultV2<string>> => {
    const connectionId = event.requestContext.connectionId;

    try {
        const deletedRecords = await db.delete(wsConnections).where(eq(wsConnections.connectionId, connectionId)).returning();

        const count = deletedRecords.length;
        logger.info(`Successfully deleted ${count} connection records for connectionId: ${connectionId}`);

        return {statusCode: 200, body: `Disconnected. Removed ${count} records.`};
    } catch (error) {
        logger.error('Error during disconnect', error as Error);

        if (error instanceof Error) {
            return {statusCode: 500, body: `Failed to disconnect: ${error.message}`};
        }

        return {statusCode: 500, body: 'Failed to disconnect due to an unknown error'};
    }
};

const onConnect = async (event: WebsocketEvent): Promise<APIGatewayProxyResultV2<string>> => {
    const token = event.queryStringParameters?.token;
    if (!token) {
        logger.info('Connection denied: No token provided');
        return {statusCode: 401, body: 'Unauthorized: No authentication token provided'};
    }

    let tokenPayload: WSToken;
    try {
        tokenPayload = validateWebSocketToken(token);
        logger.info('WebSocket token validation successful', {userId: tokenPayload.userId});
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.info('Connection denied: Invalid token', {message});
        return {statusCode: 401, body: 'Unauthorized: Invalid authentication token'};
    }

    const integrations = tokenPayload.integrations;
    const userId = tokenPayload.userId;
    if (integrations.length === 0) {
        logger.info('No integrations found for user', {userId});
        return {statusCode: 401, body: 'Connection denied: No authorized integrations found'};
    }

    try {
        const values = integrations.map((integrationId) => ({
            integrationId,
            connectionId: event.requestContext.connectionId,
            userId,
        }));

        await db.insert(wsConnections).values(values);

        logger.info('Connection stored for integrations', {integrations});
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to store connections', error as Error);
        return {statusCode: 500, body: `Failed to connect: ${message}`};
    }

    return {statusCode: 200, body: 'Connected.'};
};
