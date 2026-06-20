/**
 * Backfill task contract.
 *
 * Tasks are JSON bodies on a standard SQS queue, modeled as a discriminated
 * union (mirroring the `WebhookMessage | OrgMemberSyncTask` routing in the
 * webhook worker). Each task processes at most one API page or one entity so no
 * single Lambda invocation can run long enough to hit the timeout — every unit
 * retries independently via SQS and the whole run resumes automatically.
 */

import type {WorkflowRunEvent} from '@gitgazer/db/types';

export const BACKFILL_EVENT_TYPES = ['workflow_run', 'workflow_job', 'pull_request', 'pull_request_review'] as const;
export type BackfillEventType = (typeof BACKFILL_EVENT_TYPES)[number];

export const BACKFILL_TASK_KINDS = ['discover', 'repo', 'runs_page', 'prs_page', 'workflow_run', 'pull_request'] as const;
export type BackfillTaskKind = (typeof BACKFILL_TASK_KINDS)[number];

/** Run context carried by every task. */
interface BackfillContext {
    integrationId: string;
    owner: string;
    eventTypes: BackfillEventType[];
    /** Inclusive lower date bound (YYYY-MM-DD). */
    since?: string;
    /** Inclusive upper date bound (YYYY-MM-DD). */
    until?: string;
}

/** Entry task — lists repositories for `owner` and fans out one `repo` task each. */
export interface DiscoverTask extends BackfillContext {
    kind: 'discover';
    /** Single-repository mode: restrict discovery to this repo only. */
    repo?: string;
    /** Topic filter: only repos carrying at least one of these topics. */
    topics?: string[];
}

/** Seeds pagination for a single repository. */
export interface RepoTask extends BackfillContext {
    kind: 'repo';
    repo: string;
}

/** Fetches one page of workflow runs. */
export interface RunsPageTask extends BackfillContext {
    kind: 'runs_page';
    repo: string;
    page: number;
    /** GitHub `created` query filter derived from since/until. */
    createdFilter?: string;
}

/** Fetches one page of pull requests. */
export interface PrsPageTask extends BackfillContext {
    kind: 'prs_page';
    repo: string;
    page: number;
}

/** Ingests a single workflow run (and its jobs). */
export interface WorkflowRunTask extends BackfillContext {
    kind: 'workflow_run';
    repo: string;
    /**
     * Full workflow-run object, threaded from the `runs_page` listing. The list
     * endpoint already returns the complete run, so carrying it here avoids a
     * redundant per-run GET (`fetchWorkflowRun`) in the handler.
     */
    run: WorkflowRunEvent['workflow_run'];
}

/** Fetches a single pull request (and its reviews) and ingests them. */
export interface PullRequestTask extends BackfillContext {
    kind: 'pull_request';
    repo: string;
    pullNumber: number;
}

export type BackfillTask = DiscoverTask | RepoTask | RunsPageTask | PrsPageTask | WorkflowRunTask | PullRequestTask;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

const assertContext = (value: Record<string, unknown>): void => {
    if (typeof value.integrationId !== 'string' || value.integrationId.length === 0) {
        throw new Error('Backfill task is missing a valid "integrationId"');
    }
    if (typeof value.owner !== 'string' || value.owner.length === 0) {
        throw new Error('Backfill task is missing a valid "owner"');
    }
    if (
        !isStringArray(value.eventTypes) ||
        value.eventTypes.length === 0 ||
        value.eventTypes.some((type) => !(BACKFILL_EVENT_TYPES as readonly string[]).includes(type))
    ) {
        throw new Error(`Backfill task "eventTypes" must be a non-empty subset of: ${BACKFILL_EVENT_TYPES.join(', ')}`);
    }
    if (value.since !== undefined && typeof value.since !== 'string') {
        throw new Error('Backfill task "since" must be a string when provided');
    }
    if (value.until !== undefined && typeof value.until !== 'string') {
        throw new Error('Backfill task "until" must be a string when provided');
    }
};

const assertRepo = (value: Record<string, unknown>): void => {
    if (typeof value.repo !== 'string' || value.repo.length === 0) {
        throw new Error(`Backfill "${String(value.kind)}" task is missing a valid "repo"`);
    }
};

const assertPositiveInt = (value: unknown, field: string, kind: string): void => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(`Backfill "${kind}" task "${field}" must be a positive integer`);
    }
};

const assertRunPayload = (value: unknown): void => {
    if (!isObject(value) || typeof value.id !== 'number' || !Number.isInteger(value.id) || value.id <= 0) {
        throw new Error('Backfill "workflow_run" task "run" must be an object with a positive integer "id"');
    }
};

/**
 * Validates and narrows an unknown SQS message body into a `BackfillTask`.
 * Throws on any malformed payload so the record is routed to the DLQ rather
 * than silently dropped.
 */
export const parseTask = (value: unknown): BackfillTask => {
    if (!isObject(value)) {
        throw new Error('Backfill task must be a JSON object');
    }

    assertContext(value);

    const kind = value.kind;
    switch (kind) {
        case 'discover':
            if (value.repo !== undefined && typeof value.repo !== 'string') {
                throw new Error('Backfill "discover" task "repo" must be a string when provided');
            }
            if (value.topics !== undefined && !isStringArray(value.topics)) {
                throw new Error('Backfill "discover" task "topics" must be an array of strings when provided');
            }
            return value as unknown as DiscoverTask;
        case 'repo':
            assertRepo(value);
            return value as unknown as RepoTask;
        case 'runs_page':
            assertRepo(value);
            assertPositiveInt(value.page, 'page', 'runs_page');
            return value as unknown as RunsPageTask;
        case 'prs_page':
            assertRepo(value);
            assertPositiveInt(value.page, 'page', 'prs_page');
            return value as unknown as PrsPageTask;
        case 'workflow_run':
            assertRepo(value);
            assertRunPayload(value.run);
            return value as unknown as WorkflowRunTask;
        case 'pull_request':
            assertRepo(value);
            assertPositiveInt(value.pullNumber, 'pullNumber', 'pull_request');
            return value as unknown as PullRequestTask;
        default:
            throw new Error(`Unknown backfill task kind: ${String(kind)}`);
    }
};

/**
 * Validates a direct-invoke payload, which seeds a run. The payload is treated
 * as the initial `discover` task; `kind` defaults to `discover` when omitted.
 */
export const parseInitialTask = (value: unknown): DiscoverTask => {
    if (!isObject(value)) {
        throw new Error('Backfill invoke payload must be a JSON object');
    }

    const candidate = value.kind === undefined ? {...value, kind: 'discover'} : value;
    const task = parseTask(candidate);

    if (task.kind !== 'discover') {
        throw new Error(`Direct-invoke backfill payload must be a "discover" task, received "${task.kind}"`);
    }

    return task;
};
