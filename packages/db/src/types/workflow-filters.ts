import type {PaginationCursor} from './api';

export const WORKFLOW_FILTER_COLUMNS = ['workflow', 'repository', 'branch', 'status', 'actor', 'commit', 'run_number', 'topics'] as const;

export type WorkflowFilterColumn = (typeof WORKFLOW_FILTER_COLUMNS)[number];

export const ROLLING_WINDOWS = ['1h', '24h', '7d', '30d'] as const;

export type RollingWindow = (typeof ROLLING_WINDOWS)[number];

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
