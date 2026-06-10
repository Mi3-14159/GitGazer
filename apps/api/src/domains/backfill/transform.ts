import type {PullRequestEvent, PullRequestReviewEvent, WorkflowJobEvent, WorkflowRunEvent} from '@gitgazer/db/types';

/**
 * Transforms GitHub REST API responses into the webhook event envelopes that
 * `insertEvent` expects. Lifted from `packages/import/src/transform.ts` so the
 * serverless backfill worker can reuse the exact same ingestion path as live
 * webhooks.
 */

/** Derives the webhook `action` field from the status/conclusion of a run or job. */
const deriveAction = (status: string): string => {
    if (status === 'completed') return 'completed';
    if (status === 'in_progress') return 'in_progress';
    if (status === 'queued' || status === 'waiting' || status === 'pending') return 'queued';
    return 'completed';
};

/**
 * Transform a GitHub API workflow run response + full repo + workflow metadata
 * into the webhook `WorkflowRunEvent` format expected by `insertEvent`.
 */
export const transformWorkflowRun = (apiRun: any, fullRepo: any, workflowMeta: any): WorkflowRunEvent => {
    return {
        action: deriveAction(apiRun.status),
        repository: fullRepo,
        sender: apiRun.triggering_actor ?? apiRun.actor,
        workflow: workflowMeta,
        workflow_run: apiRun,
        organization: fullRepo.organization ?? undefined,
    } as unknown as WorkflowRunEvent;
};

/**
 * Transform a GitHub API workflow job response + full repo + sender
 * into the webhook `WorkflowJobEvent` format expected by `insertEvent`.
 */
export const transformWorkflowJob = (apiJob: any, fullRepo: any, sender: any): WorkflowJobEvent => {
    return {
        action: deriveAction(apiJob.status),
        workflow_job: apiJob,
        repository: fullRepo,
        sender,
        organization: fullRepo.organization ?? undefined,
    } as unknown as WorkflowJobEvent;
};

/** Derives the webhook `action` field from the state of a pull request. */
const derivePullRequestAction = (pr: any): string => {
    if (pr.merged_at) return 'closed';
    if (pr.state === 'closed') return 'closed';
    return 'opened';
};

/**
 * Transform a GitHub API pull request response + full repo
 * into the webhook `PullRequestEvent` format expected by `insertEvent`.
 */
export const transformPullRequest = (apiPR: any, fullRepo: any): PullRequestEvent => {
    return {
        action: derivePullRequestAction(apiPR),
        number: apiPR.number,
        pull_request: {
            ...apiPR,
            merged: !!apiPR.merged_at,
            additions: apiPR.additions ?? 0,
            deletions: apiPR.deletions ?? 0,
            changed_files: apiPR.changed_files ?? 0,
            commits: apiPR.commits ?? 0,
        },
        repository: fullRepo,
        sender: apiPR.user,
        organization: fullRepo.organization ?? undefined,
    } as unknown as PullRequestEvent;
};

/**
 * Transform a GitHub API pull request review response + PR + full repo
 * into the webhook `PullRequestReviewEvent` format expected by `insertEvent`.
 */
export const transformPullRequestReview = (apiReview: any, apiPR: any, fullRepo: any): PullRequestReviewEvent => {
    return {
        action: 'submitted',
        review: {
            ...apiReview,
            // API returns APPROVED/REQUEST_CHANGES/COMMENT, webhook expects lowercase
            state: apiReview.state.toLowerCase(),
        },
        pull_request: {
            ...apiPR,
            merged: !!apiPR.merged_at,
        },
        repository: fullRepo,
        sender: apiReview.user,
        organization: fullRepo.organization ?? undefined,
    } as unknown as PullRequestReviewEvent;
};
