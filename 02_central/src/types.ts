import {APIGatewayProxyEvent, APIGatewayProxyResult, Context} from 'aws-lambda';

// Define custom authorizer context type with groups property
export interface CustomAuthorizerContext {
    groups?: string[];
    [key: string]: any;
}

// Extend APIGatewayProxyEvent to include custom authorizer context
export interface APIGatewayProxyEventWithCustomAuth extends Omit<APIGatewayProxyEvent, 'requestContext'> {
    requestContext: APIGatewayProxyEvent['requestContext'] & {
        authorizer: CustomAuthorizerContext;
    };
}

// Custom handler type that uses the extended event
export type CustomAPIGatewayProxyHandler = (event: APIGatewayProxyEventWithCustomAuth, context: Context) => Promise<APIGatewayProxyResult>;

export type LambdaAuthorizerContext = {
    'cognito:groups'?: string[];
    [key: string]: any;
};

export type WebsocketConnection = {
    integrationId: string;
    connectionId: string;
    sub: string;
    connectedAt: string;
};
