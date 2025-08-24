import {WorkflowJobEvent, WorkflowRunEvent} from '@octokit/webhooks-types';
import {APIGatewayProxyEvent, APIGatewayProxyResult, Context} from 'aws-lambda';

export type IntegrationSecret = {
    secret: string;
    owner: string;
};

export const isWorkflowJobEvent = (event: any) => {
    return (event as WorkflowJobEvent).workflow_job !== undefined && (event as WorkflowJobEvent).workflow_job.id !== undefined;
};

export const isWorkflowRunEvent = (event: any) => {
    return (event as WorkflowRunEvent).workflow_run !== undefined && (event as WorkflowRunEvent).workflow_run.id !== undefined;
};

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

export type NotificationRule = {
    integrationId: string;
    id: string;
    channels: NotificationRuleChannel[];
    createdAt: Date;
    updatedAt: Date;
    enabled: boolean;
    ignore_dependabot: boolean;
    rule: NotificationRuleRule;
};

export type NotificationRuleChannel = {
    type: string;
    webhook_url: string;
};

export type NotificationRuleRule = {
    head_branch: string;
    owner: string;
    repository_name: string;
    workflow_name: string;
};

export type Job = {
    integrationId: string;
    job_id: number;
    created_at: Date;
    expire_at: Date;
    workflow_job_event: WorkflowJobEvent;
};
