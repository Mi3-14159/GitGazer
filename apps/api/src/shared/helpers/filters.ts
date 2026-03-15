/**
 * Shared date-window and column filter parsing utilities.
 */

import type {WorkflowFilters} from '@gitgazer/db/types';
import {ROLLING_WINDOWS, WORKFLOW_FILTER_COLUMNS} from '@gitgazer/db/types';

/**
 * Extract date-range filters from query parameters.
 * Supports both rolling windows (e.g. "1h", "24h") and explicit from/to dates.
 */
export function parseDateFilters(
    queryStringParameters: Record<string, string | undefined> | undefined,
): Pick<WorkflowFilters, 'window' | 'created_from' | 'created_to'> {
    const filters: Pick<WorkflowFilters, 'window' | 'created_from' | 'created_to'> = {};

    if (queryStringParameters?.window) {
        const w = queryStringParameters.window;
        if (ROLLING_WINDOWS.includes(w as WorkflowFilters['window'] & string)) {
            filters.window = w as WorkflowFilters['window'];
        }
    } else {
        if (queryStringParameters?.created_from) {
            filters.created_from = queryStringParameters.created_from;
        }
        if (queryStringParameters?.created_to) {
            filters.created_to = queryStringParameters.created_to;
        }
    }

    return filters;
}

/**
 * Extract column filters from query parameters for workflow listing.
 * Mutates queryStringParameters by removing consumed keys.
 */
export function parseWorkflowColumnFilters(
    queryStringParameters: Record<string, string | undefined> | null | undefined,
): WorkflowFilters {
    const filters: WorkflowFilters = {};

    if (!queryStringParameters) return filters;

    for (const column of WORKFLOW_FILTER_COLUMNS) {
        const value = queryStringParameters[column];
        if (typeof value === 'string' && value.length > 0) {
            filters[column] = value.split(',');
            delete queryStringParameters[column];
        }
    }

    // Extract date range filters
    if (queryStringParameters.window) {
        filters.window = queryStringParameters.window as WorkflowFilters['window'];
        delete queryStringParameters.window;
    } else {
        if (queryStringParameters.created_from) {
            filters.created_from = queryStringParameters.created_from;
            delete queryStringParameters.created_from;
        }
        if (queryStringParameters.created_to) {
            filters.created_to = queryStringParameters.created_to;
            delete queryStringParameters.created_to;
        }
    }

    return filters;
}
