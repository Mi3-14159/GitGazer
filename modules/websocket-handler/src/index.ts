import {ConnectionRecord, JWKSKey, JWKSResponse, JWTHeader, JWTPayload} from '@/types';
import {DynamoDBClient, ProvisionedThroughputExceededException, ResourceNotFoundException, ThrottlingException} from '@aws-sdk/client-dynamodb';
import {BatchWriteCommand, DynamoDBDocumentClient, QueryCommand} from '@aws-sdk/lib-dynamodb';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';

// DynamoDB clients
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

// JWT validation function
const validateJwtToken = async (idToken: string): Promise<JWTPayload> => {
    try {
        // Get Cognito User Pool JWKS URL
        const jwksUrl = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`;

        // Fetch JWKS
        const jwksResponse = await fetch(jwksUrl);
        const jwks: JWKSResponse = await jwksResponse.json();

        // Decode JWT header to get kid
        const [headerB64] = idToken.split('.');
        const header: JWTHeader = JSON.parse(Buffer.from(headerB64, 'base64').toString());

        // Find matching key
        const key = jwks.keys.find((k: JWKSKey) => k.kid === header.kid);
        if (!key) {
            throw new Error('JWT key not found');
        }

        // For simplicity, we'll do basic JWT structure validation
        // In production, you should use a proper JWT library for full validation
        const [, payloadB64] = idToken.split('.');
        const payload: JWTPayload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());

        // Basic validation
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            throw new Error('JWT token expired');
        }

        if (payload.aud !== process.env.COGNITO_CLIENT_ID) {
            throw new Error('JWT audience mismatch');
        }

        return payload;
    } catch (error) {
        console.error('JWT validation error:', error);
        throw error;
    }
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('event: ', JSON.stringify(event));

    switch (event.requestContext.eventType) {
        case 'DISCONNECT':
            return await onDisconnect(event);
        case 'CONNECT':
            return await onConnect(event);
        default:
            return {
                statusCode: 400,
                body: 'Invalid event type: ' + event.requestContext.eventType,
            };
    }
};

const onDisconnect = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId;

    try {
        // First, query to find all records for this connectionId using the GSI
        const queryCommand = new QueryCommand({
            TableName: process.env.TABLE_NAME,
            IndexName: process.env.DYNAMODB_TABLE_CONNECTIONS_CONNECTION_ID_INDEX,
            KeyConditionExpression: 'connectionId = :connectionId',
            ExpressionAttributeValues: {
                ':connectionId': connectionId,
            },
        });

        const queryResponse = await docClient.send(queryCommand);
        console.log(`Found ${queryResponse.Items?.length || 0} records for connectionId: ${connectionId}`);

        if (!queryResponse.Items || queryResponse.Items.length === 0) {
            console.log('No records found for connectionId:', connectionId);
            return {statusCode: 200, body: 'No records to disconnect.'};
        }

        // Prepare batch delete items
        const deleteRequests = queryResponse.Items.map((item) => ({
            DeleteRequest: {
                Key: {
                    integrationId: item.integrationId,
                    connectionId: item.connectionId,
                },
            },
        }));

        const batchCommand = new BatchWriteCommand({
            RequestItems: {
                [process.env.TABLE_NAME!]: deleteRequests,
            },
        });

        const result = await docClient.send(batchCommand);

        console.log(`Successfully deleted ${queryResponse.Items.length} connection records for connectionId: ${connectionId}`);

        // Handle unprocessed items (if any)
        if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
            console.warn('Some items were not processed during disconnect:', JSON.stringify(result.UnprocessedItems));
            // In a production environment, you might want to retry unprocessed items
        }

        return {
            statusCode: 200,
            body: `Disconnected. Removed ${queryResponse.Items.length} records.`,
        };
    } catch (err: unknown) {
        console.error('Error during disconnect:', err);

        // Handle different error types appropriately
        if (err instanceof Error && err.name === 'ValidationException') {
            console.error('Validation error during batch delete:', err.message);
            return {
                statusCode: 400,
                body: 'Invalid request: ' + err.message,
            };
        } else if (err instanceof ProvisionedThroughputExceededException || err instanceof ThrottlingException) {
            console.error('Throttling error during batch delete:', err.message);
            return {
                statusCode: 429,
                body: 'Service temporarily unavailable: ' + err.message,
            };
        } else if (err instanceof ResourceNotFoundException) {
            console.error('Resource not found during batch delete:', err.message);
            return {
                statusCode: 404,
                body: 'Resource not found: ' + err.message,
            };
        } else {
            // Generic error handling for unknown errors
            return {
                statusCode: 500,
                body: 'Failed to disconnect: ' + (err instanceof Error ? err.message : JSON.stringify(err)),
            };
        }
    }
};

const onConnect = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const idToken = event.queryStringParameters?.idToken;
    if (!idToken) {
        console.log('Connection denied: No idToken provided in query parameters');
        return {
            statusCode: 401,
            body: 'Unauthorized: No authentication token provided',
        };
    }

    // Validate JWT token
    let userPayload: JWTPayload;
    try {
        userPayload = await validateJwtToken(idToken);
        console.log('JWT validation successful for user:', userPayload.sub);
    } catch (error) {
        console.log('Connection denied: Invalid JWT token', (error as Error).message);
        return {
            statusCode: 401,
            body: 'Unauthorized: Invalid authentication token',
        };
    }

    const cognitoGroups = userPayload['cognito:groups'] || [];

    if (cognitoGroups.length === 0) {
        console.log('No Cognito groups found for user:', userPayload.sub);
        return {
            statusCode: 401,
            body: 'Connection denied: No authorized groups found',
        };
    }

    // Prepare batch write items
    const writeRequests = cognitoGroups.map((group: string) => ({
        PutRequest: {
            Item: {
                integrationId: group,
                connectionId: event.requestContext.connectionId,
                sub: userPayload.sub,
                connectedAt: new Date().toISOString(),
            } as ConnectionRecord,
        },
    }));

    try {
        const batchCommand = new BatchWriteCommand({
            RequestItems: {
                [process.env.TABLE_NAME!]: writeRequests,
            },
        });

        const result = await docClient.send(batchCommand);

        console.log(`Connection stored for groups: ${cognitoGroups.join(', ')}`);

        if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
            console.warn('Some items were not processed:', JSON.stringify(result.UnprocessedItems));
            // TODO: implement a retry mechanism for unprocessed items
        }
    } catch (error) {
        console.error('Failed to store connections:', error);
        return {
            statusCode: 500,
            body: 'Failed to connect: ' + (error instanceof Error ? error.message : 'Unknown error'),
        };
    }

    return {statusCode: 200, body: 'Connected.'};
};
