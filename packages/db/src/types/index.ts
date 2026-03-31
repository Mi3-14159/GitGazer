import type {EmitterWebhookEventName} from '@octokit/webhooks';
import type {ExtractTablesWithRelations} from 'drizzle-orm';
import type {BuildQueryResult} from 'drizzle-orm/relations';

export type {EmitterWebhookEventName} from '@octokit/webhooks';
export type * from '@octokit/webhooks-types';
export * from './metrics';

import type {integrationsQueryRelations, workflowRunRelations} from '../queries';
import type * as schema from '../schema';

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

const ALLOWED_WEBHOOK_HOSTS = new Set(['hooks.slack.com']);

const isAllowedWebhookUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return false;
        // Block private/internal IPs
        const hostname = parsed.hostname;
        if (
            hostname === 'localhost' ||
            hostname.startsWith('127.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            hostname === '169.254.169.254' ||
            hostname.startsWith('169.254.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
            hostname === '[::1]' ||
            hostname === '0.0.0.0'
        ) {
            return false;
        }
        return ALLOWED_WEBHOOK_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
};

export const isNotificationRuleChannel = (channel: any): channel is NotificationRuleChannel => {
    return (
        Object.values(NotificationRuleChannelType).includes(channel.type) &&
        typeof channel.webhook_url === 'string' &&
        isAllowedWebhookUrl(channel.webhook_url)
    );
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

// Event Log types
export const EVENT_LOG_TYPES = ['failure', 'success', 'warning', 'info', 'alert'] as const;
export type EventLogType = (typeof EVENT_LOG_TYPES)[number];

export const EVENT_LOG_CATEGORIES = ['notification', 'integration'] as const;
export type EventLogCategory = (typeof EVENT_LOG_CATEGORIES)[number];

export const EVENT_LOG_READ_VALUES = ['unread', 'read'] as const;

export type EventLogEntryMetadata = {
    repositoryId?: number;
    repository?: string;
    branch?: string;
    actor?: string;
    commit?: string;
    workflowName?: string;
    jobName?: string;
    workflowRunId?: number;
    workflowJobId?: number;
    integrationId?: string;
    integrationLabel?: string;
    installationId?: number;
    accountLogin?: string;
    webhookEvents?: string[];
};

export type EventLogEntryRow = typeof schema.eventLogEntries.$inferSelect;
export type EventLogEntryInsert = typeof schema.eventLogEntries.$inferInsert;

export const isEventLogEntry = (value: unknown): value is EventLogEntryRow => {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.id === 'string' &&
        typeof v.type === 'string' &&
        EVENT_LOG_TYPES.includes(v.type as EventLogType) &&
        typeof v.title === 'string' &&
        typeof v.message === 'string' &&
        typeof v.read === 'boolean' &&
        typeof v.createdAt === 'string'
    );
};

export type EventLogStats = {
    total: number;
    unread: number;
    read: number;
};

export const isEventLogStats = (value: unknown): value is EventLogStats => {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return typeof v.total === 'number' && typeof v.unread === 'number' && typeof v.read === 'number';
};

export type EventLogFilters = {
    type?: EventLogType[];
    category?: EventLogCategory[];
    read?: boolean;
    search?: string;
    repositoryIds?: number[];
    topics?: string[];
    integrationIds?: string[];
    limit?: number;
    offset?: number;
};

export const isNotificationRuleUpdate = (rule: any): rule is NotificationRuleUpdate => {
    return (
        Array.isArray(rule.channels) &&
        rule.channels.every(isNotificationRuleChannel) &&
        typeof rule.enabled === 'boolean' &&
        typeof rule.ignore_dependabot === 'boolean' &&
        isNotificationRuleRule(rule.rule)
    );
};

export type Event<Subtype> = {
    integrationId: string;
    id: string;
    created_at: string;
    event_type: EmitterWebhookEventName;
    event: Subtype;
};

export type PaginationCursor = {
    createdAt: string;
    id: number;
};

export type PaginatedResponse<T> = {
    items: T[];
    cursor?: PaginationCursor;
};

export type GetWorkflowsResponse = PaginatedResponse<WorkflowRunWithRelations>;

export type OverviewStats = {
    total: number;
    success: number;
    failure: number;
    inProgress: number;
    other: number;
};

export type OverviewResponse = {
    stats: OverviewStats;
    recentWorkflows: WorkflowRunWithRelations[];
};

export const WORKFLOW_FILTER_COLUMNS = ['workflow', 'repository', 'branch', 'status', 'actor', 'commit', 'run_number', 'topics'] as const;

export type WorkflowFilterColumn = (typeof WORKFLOW_FILTER_COLUMNS)[number];

export const ROLLING_WINDOWS = ['1h', '24h', '7d', '30d'] as const;

export type RollingWindow = (typeof ROLLING_WINDOWS)[number];

export type WorkflowFilters = Partial<Record<WorkflowFilterColumn, string[]>> & {
    created_from?: string;
    created_to?: string;
    window?: RollingWindow;
};

export type WorkflowsRequestParameters = {
    limit?: number;
    cursor?: PaginationCursor;
    filters?: WorkflowFilters;
};

export const isWorkflowsRequestParameters = (params: any): params is WorkflowsRequestParameters => {
    if (!params) {
        return true;
    }

    if (params.limit && isNaN(parseInt(params.limit, 10))) {
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

    if (params.filters !== undefined) {
        if (typeof params.filters !== 'object' || params.filters === null) {
            return false;
        }
        for (const [key, values] of Object.entries(params.filters)) {
            if (key === 'created_from' || key === 'created_to') {
                if (typeof values !== 'string') {
                    return false;
                }
                continue;
            }
            if (key === 'window') {
                if (!ROLLING_WINDOWS.includes(values as RollingWindow)) {
                    return false;
                }
                continue;
            }
            if (!WORKFLOW_FILTER_COLUMNS.includes(key as WorkflowFilterColumn)) {
                return false;
            }
            if (!Array.isArray(values) || !values.every((v: unknown) => typeof v === 'string')) {
                return false;
            }
        }
    }

    return true;
};

export type StreamEvent<T> = {
    eventType: EmitterWebhookEventName;
    integrationId: string;
    payload: T;
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

export const isUserAttributes = (value: unknown): value is UserAttributes => {
    return typeof value === 'object' && value !== null;
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

export type Schema = ExtractTablesWithRelations<typeof schema>;

export type WorkflowRun = typeof schema.workflowRuns.$inferSelect;
export type WorkflowJob = typeof schema.workflowJobs.$inferSelect;
export type PullRequest = typeof schema.pullRequests.$inferSelect;
export type PullRequestReview = typeof schema.pullRequestReviews.$inferSelect;
export type GithubAppInstallation = typeof schema.githubAppInstallations.$inferSelect;
export type GithubAppWebhook = typeof schema.githubAppWebhooks.$inferSelect;
export type RepositoryInsert = typeof schema.repositories.$inferInsert;

export type WorkflowRunWithRelations = BuildQueryResult<Schema, Schema['workflowRuns'], {with: typeof workflowRunRelations}>;
export type Integration = BuildQueryResult<Schema, Schema['integrations'], {with: typeof integrationsQueryRelations}>;

export const WEBSOCKET_CHANNELS = ['workflows', 'events_log'] as const;
export type WebSocketChannel = (typeof WEBSOCKET_CHANNELS)[number];
