import {WorkflowJobEvent, WorkflowRunEvent} from '@octokit/webhooks-types';
import {APIGatewayProxyEvent, APIGatewayProxyResult, Context} from 'aws-lambda';

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
    id?: string;
    channels: NotificationRuleChannel[];
    createdAt: string;
    updatedAt: string;
    enabled: boolean;
    ignore_dependabot: boolean;
    rule: NotificationRuleRule;
};

// implement a guard clause for NotificationRule
export const isNotificationRule = (rule: any): rule is NotificationRule => {
    return (
        typeof rule.integrationId === 'string' &&
        Array.isArray(rule.channels) &&
        rule.channels.every(isNotificationRuleChannel) &&
        typeof rule.createdAt === 'string' &&
        typeof rule.updatedAt === 'string' &&
        typeof rule.enabled === 'boolean' &&
        typeof rule.ignore_dependabot === 'boolean' &&
        isNotificationRuleRule(rule.rule)
    );
};

export type NotificationRuleChannel = {
    type: string;
    webhook_url: string;
};

export const isNotificationRuleChannel = (channel: any): channel is NotificationRuleChannel => {
    return typeof channel.type === 'string' && typeof channel.webhook_url === 'string';
};

export type NotificationRuleRule = {
    head_branch: string;
    owner: string;
    repository_name: string;
    workflow_name: string;
};

export const isNotificationRuleRule = (rule: any): rule is NotificationRuleRule => {
    return (
        typeof rule.head_branch === 'string' &&
        typeof rule.owner === 'string' &&
        typeof rule.repository_name === 'string' &&
        typeof rule.workflow_name === 'string'
    );
};

export type Job = {
    integrationId: string;
    job_id: number;
    created_at: Date;
    expire_at: Date;
    workflow_job_event: WorkflowJobEvent;
};

export type Integration = {
    id: string;
    label: string;
    owner: string;
    secret: string;
};

export type SSMIntegrationSecret = Omit<Integration, 'id'>;

export type LambdaAuthorizerContext = {
    'cognito:groups'?: string[];
    [key: string]: any;
};
