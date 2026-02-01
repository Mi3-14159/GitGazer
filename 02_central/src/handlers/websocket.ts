import {getLogger} from '@/logger';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {BatchWriteCommand, DynamoDBDocumentClient, QueryCommand} from '@aws-sdk/lib-dynamodb';
import {APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2, Context} from 'aws-lambda';
import {createHmac} from 'crypto';

const logger = getLogger();

const connectionsTableArn = process.env.DYNAMO_DB_CONNECTIONS_TABLE_ARN;
const connectionIdIndex = process.env.DYNAMO_DB_TABLE_CONNECTIONS_CONNECTION_ID_INDEX;
const cognitoClientSecret = process.env.COGNITO_CLIENT_SECRET;

if (!connectionsTableArn) {
    throw new Error('DYNAMO_DB_CONNECTIONS_TABLE_ARN is not defined');
}

if (!connectionIdIndex) {
    throw new Error('DYNAMO_DB_TABLE_CONNECTIONS_CONNECTION_ID_INDEX is not defined');
}

if (!cognitoClientSecret) {
    throw new Error('COGNITO_CLIENT_SECRET is not defined');
}

type WebSocketTokenPayload = {
    sub: string;
    username: string;
    email: string;
    integrations: string[];
    exp: number;
    nonce: string;
};

type ConnectionRecord = {
    integrationId: string;
    connectionId: string;
};

type WebsocketEvent = APIGatewayProxyWebsocketEventV2 & {
    queryStringParameters?: Record<string, string | undefined> | null;
};

const ddbClient = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(ddbClient);

const validateWebSocketToken = (token: string): WebSocketTokenPayload => {
    const parts = token.split('.');
    if (parts.length !== 2) {
        throw new Error('Invalid token format');
    }

    const [payloadEncoded, signatureEncoded] = parts;

    // Verify signature
    const expectedSignature = createHmac('sha256', cognitoClientSecret).update(payloadEncoded).digest('base64url');

    if (signatureEncoded !== expectedSignature) {
        throw new Error('Invalid token signature');
    }

    // Decode payload
    const payloadJson = Buffer.from(payloadEncoded, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as WebSocketTokenPayload;

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
        throw new Error('Token expired');
    }

    // Basic validation
    if (!payload.sub || !payload.integrations || !Array.isArray(payload.integrations)) {
        throw new Error('Invalid token payload');
    }

    return payload;
};

export const handler = async (event: WebsocketEvent, context: Context): Promise<APIGatewayProxyResultV2<string>> => {
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
        const queryCommand = new QueryCommand({
            TableName: connectionsTableArn,
            IndexName: connectionIdIndex,
            KeyConditionExpression: 'connectionId = :connectionId',
            ExpressionAttributeValues: {
                ':connectionId': connectionId,
            },
        });

        const queryResponse = await docClient.send(queryCommand);
        const items = (queryResponse.Items ?? []) as ConnectionRecord[];
        logger.info(`Found ${items.length} records for connectionId: ${connectionId}`);

        if (items.length === 0) {
            return {statusCode: 200, body: 'No records to disconnect.'};
        }

        const deleteRequests = items.map((item) => ({
            DeleteRequest: {
                Key: {
                    integrationId: item.integrationId,
                    connectionId: item.connectionId,
                },
            },
        }));

        const batchCommand = new BatchWriteCommand({
            RequestItems: {
                [connectionsTableArn]: deleteRequests,
            },
        });

        const result = await docClient.send(batchCommand);
        logger.info(`Successfully deleted ${items.length} connection records for connectionId: ${connectionId}`);

        if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
            logger.warn('Some items were not processed during disconnect', {unprocessed: result.UnprocessedItems});
        }

        return {statusCode: 200, body: `Disconnected. Removed ${items.length} records.`};
    } catch (error) {
        logger.error('Error during disconnect', error as Error);

        if (error instanceof Error) {
            if (error.name === 'ValidationException') {
                return {statusCode: 400, body: `Invalid request: ${error.message}`};
            }
            if (error.name === 'ProvisionedThroughputExceededException' || error.name === 'ThrottlingException') {
                return {statusCode: 429, body: `Service temporarily unavailable: ${error.message}`};
            }
            if (error.name === 'ResourceNotFoundException') {
                return {statusCode: 404, body: `Resource not found: ${error.message}`};
            }
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

    let tokenPayload: WebSocketTokenPayload;
    try {
        tokenPayload = validateWebSocketToken(token);
        logger.info('WebSocket token validation successful', {sub: tokenPayload.sub});
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.info('Connection denied: Invalid token', {message});
        return {statusCode: 401, body: 'Unauthorized: Invalid authentication token'};
    }

    const integrations = tokenPayload.integrations;
    if (integrations.length === 0) {
        logger.info('No integrations found for user', {sub: tokenPayload.sub});
        return {statusCode: 401, body: 'Connection denied: No authorized integrations found'};
    }

    const writeRequests = integrations.map((integrationId) => ({
        PutRequest: {
            Item: {
                integrationId: integrationId,
                connectionId: event.requestContext.connectionId,
                sub: tokenPayload.sub,
                connectedAt: new Date().toISOString(),
            },
        },
    }));

    try {
        const batchCommand = new BatchWriteCommand({
            RequestItems: {
                [connectionsTableArn]: writeRequests,
            },
        });

        const result = await docClient.send(batchCommand);
        logger.info('Connection stored for integrations', {integrations});

        if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
            logger.warn('Some items were not processed during connect', {unprocessed: result.UnprocessedItems});
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to store connections', error as Error);
        return {statusCode: 500, body: `Failed to connect: ${message}`};
    }

    return {statusCode: 200, body: 'Connected.'};
};
