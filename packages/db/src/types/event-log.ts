import type * as schema from '../schema';

// Event Log types
export const EVENT_LOG_TYPES = ['failure', 'success', 'warning', 'info', 'alert'] as const;
export type EventLogType = (typeof EVENT_LOG_TYPES)[number];

export const EVENT_LOG_CATEGORIES = ['notification', 'integration'] as const;
export type EventLogCategory = (typeof EVENT_LOG_CATEGORIES)[number];

export const EVENT_LOG_READ_VALUES = ['unread', 'read'] as const;

/**
 * Direction of a multi-select filter: either include only the listed values or
 * exclude them. A single filter is always one or the other, never both.
 */
export const FILTER_MODES = ['include', 'exclude'] as const;
export type FilterMode = (typeof FILTER_MODES)[number];

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
    targetUserId?: number;
    targetEmail?: string;
    role?: string;
    previousRole?: string;
    invitationId?: string;
    githubUserId?: number;
    githubLogin?: string;
    matched?: number;
    unmatched?: number;
    defaultRole?: string;
    newlyAssigned?: number;
    newlyPending?: number;
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
    typeMode?: FilterMode;
    category?: EventLogCategory[];
    categoryMode?: FilterMode;
    read?: boolean;
    search?: string;
    repositoryIds?: number[];
    repositoryIdsMode?: FilterMode;
    topics?: string[];
    topicsMode?: FilterMode;
    integrationIds?: string[];
    integrationIdsMode?: FilterMode;
    limit?: number;
};

export type EventLogCursor = {
    createdAt: string;
    id: string;
};

export type EventLogResponse = {
    items: EventLogEntryRow[];
    cursor?: EventLogCursor;
};
