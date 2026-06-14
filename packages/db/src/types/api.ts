import type {EmitterWebhookEventName} from '@octokit/webhooks';

import type {WorkflowRunWithRelations} from './entities';

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

export type StreamEvent<T> = {
    eventType: EmitterWebhookEventName;
    integrationId: string;
    payload: T;
};
