/**
 * Consistent error handling helpers.
 */

import {HttpError, HttpStatusCodes, InternalServerError} from '@aws-lambda-powertools/event-handler/http';

/**
 * If `error` is already an HttpError, rethrow it. Otherwise wrap in InternalServerError.
 */
export function ensureHttpError(error: unknown, fallbackMessage = 'Internal server error'): HttpError {
    if (error instanceof HttpError) {
        return error;
    }
    return new InternalServerError(fallbackMessage);
}

export class ConflictError extends HttpError {
    readonly statusCode = HttpStatusCodes.CONFLICT;
    readonly errorType = 'ConflictError';

    constructor(message?: string, details?: Record<string, unknown>) {
        super(message, undefined, details);
        this.name = 'ConflictError';
    }
}
