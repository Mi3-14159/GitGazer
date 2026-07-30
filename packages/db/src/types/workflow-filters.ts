import type {PaginationCursor} from './api';

export const WORKFLOW_FILTER_COLUMNS = ['workflow', 'repository', 'branch', 'status', 'actor', 'commit', 'run_number', 'topics'] as const;

export type WorkflowFilterColumn = (typeof WORKFLOW_FILTER_COLUMNS)[number];

export const ROLLING_WINDOWS = ['1h', '24h', '7d', '30d'] as const;

export type RollingWindow = (typeof ROLLING_WINDOWS)[number];

/** Duration each rolling window spans. Keep in sync with ROLLING_WINDOWS. */
const ROLLING_WINDOW_MS: Record<RollingWindow, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
};

export type DateBounds = {from?: Date; to?: Date};

/**
 * Resolve a date filter to absolute bounds. A rolling `window` wins over an explicit
 * created_from/created_to range; an unrecognised window falls back to 24h.
 *
 * Single source of truth for window arithmetic, so every endpoint that accepts these filters
 * (workflow list, workflow filter-value counts, overview) reports over the same time range.
 * Returns plain Dates rather than query conditions because callers need different shapes —
 * `gte`/`lte` SQL for .select(), or a declarative `{createdAt: {gte, lte}}` relational filter.
 */
export const resolveDateBounds = (filters?: {window?: RollingWindow; created_from?: string; created_to?: string}): DateBounds => {
    if (filters?.window) {
        const now = new Date();
        return {from: new Date(now.getTime() - (ROLLING_WINDOW_MS[filters.window] ?? ROLLING_WINDOW_MS['24h'])), to: now};
    }

    return {
        from: filters?.created_from ? new Date(filters.created_from) : undefined,
        to: filters?.created_to ? new Date(filters.created_to) : undefined,
    };
};

export type WorkflowFilters = Partial<Record<WorkflowFilterColumn, string[]>> & {
    created_from?: string;
    created_to?: string;
    window?: RollingWindow;
};

export type FilterValuesParams = {
    integrationIds: string[];
    column: WorkflowFilterColumn;
    search?: string;
    limit?: number;
    window?: RollingWindow;
    created_from?: string;
    created_to?: string;
};

export type FilterValueResult = {value: string; count: number};

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
