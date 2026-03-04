import type {EmitterWebhookEventName} from '@octokit/webhooks';
import type {EventPayloadMap} from '@octokit/webhooks-types';

export type * from '@octokit/webhooks-types';

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

export enum NotificationRuleChannelType {
    SLACK = 'SLACK',
}

export type NotificationRuleChannel = {
    type: NotificationRuleChannelType;
    webhook_url: string;
};

export const isNotificationRuleChannel = (channel: any): channel is NotificationRuleChannel => {
    return Object.values(NotificationRuleChannelType).includes(channel.type) && typeof channel.webhook_url === 'string';
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

export type NotificationRuleUpdate = Omit<NotificationRule, 'createdAt' | 'updatedAt' | 'integrationId' | 'id'>;

export const isNotificationRuleUpdate = (rule: any): rule is NotificationRuleUpdate => {
    return (
        Array.isArray(rule.channels) &&
        rule.channels.every(isNotificationRuleChannel) &&
        typeof rule.enabled === 'boolean' &&
        typeof rule.ignore_dependabot === 'boolean' &&
        isNotificationRuleRule(rule.rule)
    );
};

export type Integration = {
    id: string;
    label: string;
    owner: number;
    secret: string;
};

export const isIntegration = (integration: any): integration is Integration => {
    return (
        typeof integration.id === 'string' &&
        typeof integration.label === 'string' &&
        typeof integration.owner === 'string' &&
        typeof integration.secret === 'string'
    );
};

export type Event<Subtype> = {
    integrationId: string;
    id: string;
    created_at: string;
    expire_at?: number;
    event_type: EmitterWebhookEventName;
    event_type_group?: string;
    event: Subtype;
};

export enum ProjectionType {
    minimal = 'minimal',
}

export type PaginationCursor = {
    createdAt: string;
    id: number;
};

export type PaginatedResponse<T> = {
    items: T[];
    cursor?: PaginationCursor;
};

export type WorkflowRunConclusion = 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | 'stale' | 'skipped';

export type WorkflowJob = {
    integrationId: string;
    repositoryId: number;
    id: number;
    completedAt: string | null;
    conclusion: string | null;
    createdAt: string;
    headBranch: string;
    name: string;
    runnerGroupName: string | null;
    runAttempt: number;
    runId: number;
    startedAt: string;
    status: string;
    workflowName: string;
    workflowRunId: number;
};

export type Repository = {
    fullName: string;
};

export type WorkflowRun = {
    integrationId: string;
    repositoryId: number;
    id: number;
    actorId: number;
    conclusion: WorkflowRunConclusion | null;
    createdAt: string;
    headBranch: string;
    name: string;
    runAttempt: number;
    status: string;
    runStartedAt: string;
    updatedAt: string;
    workflowId: number;
    headCommitAuthorName: string;
    headCommitMessage: string;
    workflowJobs: WorkflowJob[];
    repository: Repository;
};

export type GetWorkflowsResponse = PaginatedResponse<WorkflowRun>;

export type WorkflowsRequestParameters = {
    limit?: number;
    projection?: ProjectionType;
    cursor?: PaginationCursor;
};

export const isWorkflowsRequestParameters = (params: any): params is WorkflowsRequestParameters => {
    if (!params) {
        return true;
    }

    if (params.limit && isNaN(parseInt(params.limit, 10))) {
        return false;
    }

    if (params.projection && !Object.values(ProjectionType).includes(params.projection)) {
        return false;
    }

    if (params.cursor !== undefined) {
        if (
            typeof params.cursor !== 'object' ||
            params.cursor === null ||
            typeof params.cursor.createdAt !== 'string' ||
            typeof params.cursor.id !== 'number'
        ) {
            return false;
        }
    }

    return true;
};

export type StreamEvent<T extends keyof EventPayloadMap> = {
    eventType: EmitterWebhookEventName;
    payload: Event<EventPayloadMap[T]>;
};

export type UserAttributes = {
    userId?: number;
    sub?: string;
    username?: string;
    email?: string;
    name?: string;
    nickname?: string;
    picture?: string;
};

export type WSToken = {
    userId: number;
    username: string;
    email: string;
    integrations: string[];
    exp: number;
    nonce: string;
};

export type State = {
    redirect_url: string;
};
