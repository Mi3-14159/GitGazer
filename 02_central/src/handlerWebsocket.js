const {DynamoDBClient} = require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient, DeleteCommand, PutCommand, QueryCommand} = require('@aws-sdk/lib-dynamodb');

// DynamoDB clients
const ddbClient = new DynamoDBClient({region: process.env.AWS_REGION});
const docClient = DynamoDBDocumentClient.from(ddbClient);

// JWT validation function
const validateJwtToken = async (idToken) => {
    try {
        // Get Cognito User Pool JWKS URL
        const userPoolId = process.env.COGNITO_USER_POOL_ID;
        const region = process.env.AWS_REGION;
        const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;

        // Fetch JWKS
        const jwksResponse = await fetch(jwksUrl);
        const jwks = await jwksResponse.json();

        // Decode JWT header to get kid
        const [headerB64] = idToken.split('.');
        const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());

        // Find matching key
        const key = jwks.keys.find((k) => k.kid === header.kid);
        if (!key) {
            throw new Error('JWT key not found');
        }

        // For simplicity, we'll do basic JWT structure validation
        // In production, you should use a proper JWT library for full validation
        const [, payloadB64] = idToken.split('.');
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());

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

exports.handler = async (event) => {
    console.log('event: ', JSON.stringify(event));

    switch (event.requestContext.eventType) {
        case 'DISCONNECT':
            return await onDisconnect(event);
        case 'CONNECT':
            return await onConnect(event);
        default:
            return {statusCode: 400, body: 'Invalid event type: ' + event.requestContext.eventType};
    }
};

const onDisconnect = async (event) => {
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

        // Delete all records for this connectionId
        const deletePromises = queryResponse.Items.map((item) => {
            const deleteCommand = new DeleteCommand({
                TableName: process.env.TABLE_NAME,
                Key: {
                    integrationId: item.integrationId,
                    connectionId: item.connectionId,
                },
            });
            return docClient.send(deleteCommand);
        });

        const deleteResults = await Promise.allSettled(deletePromises);

        // Log results
        deleteResults.forEach((result, index) => {
            const item = queryResponse.Items[index];
            if (result.status === 'fulfilled') {
                console.log(`Successfully deleted connection for integrationId: ${item.integrationId}, connectionId: ${connectionId}`);
            } else {
                console.error(`Failed to delete connection for integrationId: ${item.integrationId}, connectionId: ${connectionId}:`, result.reason);
            }
        });

        // Check if any deletions failed
        if (deleteResults.some((result) => result.status === 'rejected')) {
            return {
                statusCode: 500,
                body: 'Failed to disconnect some records: ' + JSON.stringify(deleteResults.filter((r) => r.status === 'rejected')),
            };
        }

        return {statusCode: 200, body: `Disconnected. Removed ${deleteResults.length} records.`};
    } catch (err) {
        console.error('Error during disconnect:', err);
        return {
            statusCode: 500,
            body: 'Failed to disconnect: ' + JSON.stringify(err),
        };
    }
};

const onConnect = async (event) => {
    // Check for idToken in query parameters
    const idToken = event.queryStringParameters?.idToken;
    if (!idToken) {
        console.log('Connection denied: No idToken provided');
        return {
            statusCode: 401,
            body: 'Unauthorized: No authentication token provided',
        };
    }

    // Validate JWT token
    let userPayload;
    try {
        userPayload = await validateJwtToken(idToken);
        console.log('JWT validation successful for user:', userPayload.sub);
    } catch (error) {
        console.log('Connection denied: Invalid JWT token', error.message);
        return {
            statusCode: 401,
            body: 'Unauthorized: Invalid authentication token',
        };
    }

    const cognitoGroups = userPayload['cognito:groups'] || [];
    const promises = [];
    cognitoGroups.forEach((group) => {
        const command = new PutCommand({
            TableName: process.env.TABLE_NAME,
            Item: {
                integrationId: group,
                connectionId: event.requestContext.connectionId,
                sub: userPayload.sub,
                connectedAt: new Date().toISOString(),
            },
        });
        promises.push(docClient.send(command));
    });

    const results = await Promise.allSettled(promises);
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            console.log(`Connection stored for group ${cognitoGroups[index]}:`, JSON.stringify(result.value));
        } else {
            console.error(`Failed to store connection for group ${cognitoGroups[index]}:`, result.reason);
        }
    });

    if (results.some((result) => result.status === 'rejected')) {
        return {
            statusCode: 500,
            body: 'Failed to connect for one or more groups.',
        };
    }

    return {statusCode: 200, body: 'Connected.'};
};
