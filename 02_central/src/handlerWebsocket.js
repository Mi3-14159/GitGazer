const {DynamoDBClient} = require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient, DeleteCommand, PutCommand} = require('@aws-sdk/lib-dynamodb');

// DynamoDB clients
const ddbClient = new DynamoDBClient({region: process.env.AWS_REGION});
const docClient = DynamoDBDocumentClient.from(ddbClient);

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
    const command = new DeleteCommand({
        TableName: process.env.TABLE_NAME,
        Key: {
            connectionId: event.requestContext.connectionId,
        },
    });

    try {
        const response = await docClient.send(command);
        console.log(JSON.stringify(response));
    } catch (err) {
        return {
            statusCode: 500,
            body: 'Failed to disconnect: ' + JSON.stringify(err),
        };
    }

    return {statusCode: 200, body: 'Disconnected.'};
};

const onConnect = async (event) => {
    const command = new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
            connectionId: event.requestContext.connectionId,
        },
    });

    try {
        const response = await docClient.send(command);
        console.log(JSON.stringify(response));
    } catch (err) {
        return {
            statusCode: 500,
            body: 'Failed to connect: ' + JSON.stringify(err),
        };
    }

    return {statusCode: 200, body: 'Connected.'};
};
