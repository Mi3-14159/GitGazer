import {getLogger} from '@/logger';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {BatchWriteCommand, DynamoDBDocumentClient, QueryCommand} from '@aws-sdk/lib-dynamodb';
import {APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2, Context} from 'aws-lambda';

const logger = getLogger();

const connectionsTableArn = process.env.DYNAMO_DB_CONNECTIONS_TABLE_ARN;
const connectionIdIndex = process.env.DYNAMO_DB_TABLE_CONNECTIONS_CONNECTION_ID_INDEX;
const cognitoClientId = process.env.COGNITO_CLIENT_ID;
const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID;

if (!connectionsTableArn) {
    throw new Error('DYNAMO_DB_CONNECTIONS_TABLE_ARN is not defined');
}

if (!connectionIdIndex) {
    throw new Error('DYNAMO_DB_TABLE_CONNECTIONS_CONNECTION_ID_INDEX is not defined');
}

if (!cognitoUserPoolId) {
    throw new Error('COGNITO_USER_POOL_ID is not defined');
}

if (!cognitoClientId) {
    throw new Error('COGNITO_CLIENT_ID is not defined');
}

type Jwks = {
    keys: {kid: string}[];
};

type CognitoJwtPayload = {
    sub: string;
    aud: string;
    exp: number;
    'cognito:groups'?: string[];
    [key: string]: unknown;
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

const base64UrlDecode = (segment: string): string => {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf8');
};

const validateJwtToken = async (idToken: string): Promise<CognitoJwtPayload> => {
    const jwksUrl = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${cognitoUserPoolId}/.well-known/jwks.json`;
    const jwksResponse = await fetch(jwksUrl);
    if (!jwksResponse.ok) {
        throw new Error(`Failed to fetch JWKS: ${jwksResponse.status}`);
    }
    const jwks = (await jwksResponse.json()) as Jwks;

    const [headerSegment, payloadSegment] = idToken.split('.');
    if (!headerSegment || !payloadSegment) {
        throw new Error('Invalid JWT format');
    }

    const header = JSON.parse(base64UrlDecode(headerSegment)) as {kid?: string};
    const key = jwks.keys.find((k) => k.kid === header.kid);
    if (!key) {
        throw new Error('JWT key not found');
    }

    const payload = JSON.parse(base64UrlDecode(payloadSegment)) as CognitoJwtPayload;

    // Basic validation only; signature validation should use a JWT library in production.
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
        throw new Error('JWT token expired');
    }

    if (payload.aud !== cognitoClientId) {
        throw new Error('JWT audience mismatch');
    }

    return payload;
};

export const handler = async (event: WebsocketEvent, context: Context): Promise<APIGatewayProxyResultV2<string>> => {
    logger.resetKeys();
    logger.addContext(context);
    logger.logEventIfEnabled(event);

    switch (event.requestContext.eventType) {
        case 'DISCONNECT':
            return onDisconnect(event);
        case 'CONNECT':
            return onConnect(event);
        default:
            return {statusCode: 400, body: `Invalid event type: ${event.requestContext.eventType}`};
    }
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
    } catch (err) {
        logger.error('Error during disconnect', {error: err});

        if (err instanceof Error) {
            if (err.name === 'ValidationException') {
                return {statusCode: 400, body: `Invalid request: ${err.message}`};
            }
            if (err.name === 'ProvisionedThroughputExceededException' || err.name === 'ThrottlingException') {
                return {statusCode: 429, body: `Service temporarily unavailable: ${err.message}`};
            }
            if (err.name === 'ResourceNotFoundException') {
                return {statusCode: 404, body: `Resource not found: ${err.message}`};
            }
            return {statusCode: 500, body: `Failed to disconnect: ${err.message}`};
        }

        return {statusCode: 500, body: 'Failed to disconnect due to an unknown error'};
    }
};

const onConnect = async (event: WebsocketEvent): Promise<APIGatewayProxyResultV2<string>> => {
    const idToken = event.queryStringParameters?.idToken;
    if (!idToken) {
        logger.info('Connection denied: No idToken provided');
        return {statusCode: 401, body: 'Unauthorized: No authentication token provided'};
    }

    let userPayload: CognitoJwtPayload;
    try {
        userPayload = await validateJwtToken(idToken);
        logger.info('JWT validation successful', {sub: userPayload.sub});
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.info('Connection denied: Invalid JWT token', {message});
        return {statusCode: 401, body: 'Unauthorized: Invalid authentication token'};
    }

    const cognitoGroups = Array.isArray(userPayload['cognito:groups']) ? userPayload['cognito:groups'] : [];
    if (cognitoGroups.length === 0) {
        logger.info('No Cognito groups found for user', {sub: userPayload.sub});
        return {statusCode: 401, body: 'Connection denied: No authorized groups found'};
    }

    const writeRequests = cognitoGroups.map((group) => ({
        PutRequest: {
            Item: {
                integrationId: group,
                connectionId: event.requestContext.connectionId,
                sub: userPayload.sub,
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
        logger.info('Connection stored for groups', {groups: cognitoGroups});

        if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
            logger.warn('Some items were not processed during connect', {unprocessed: result.UnprocessedItems});
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to store connections', {error});
        return {statusCode: 500, body: `Failed to connect: ${message}`};
    }

    return {statusCode: 200, body: 'Connected.'};
};
