export const HttpStatusCodes = {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,
    FOUND: 302,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
} as const;

export abstract class HttpError extends Error {
    abstract readonly statusCode: number;
    abstract readonly errorType: string;
    readonly details?: Record<string, unknown>;

    // Second parameter keeps the Powertools signature (message, options, details) for existing call sites
    constructor(message?: string, _options?: unknown, details?: Record<string, unknown>) {
        super(message);
        this.name = 'HttpError';
        this.details = details;
    }

    toJSON() {
        return {
            statusCode: this.statusCode,
            error: this.errorType,
            message: this.message,
            ...(this.details && {details: this.details}),
        };
    }

    toWebResponse(): Response {
        return Response.json(this.toJSON(), {status: this.statusCode});
    }
}

export class BadRequestError extends HttpError {
    readonly statusCode = HttpStatusCodes.BAD_REQUEST;
    readonly errorType = 'BadRequestError';
    name = 'BadRequestError';
}

export class UnauthorizedError extends HttpError {
    readonly statusCode = HttpStatusCodes.UNAUTHORIZED;
    readonly errorType = 'UnauthorizedError';
    name = 'UnauthorizedError';
}

export class ForbiddenError extends HttpError {
    readonly statusCode = HttpStatusCodes.FORBIDDEN;
    readonly errorType = 'ForbiddenError';
    name = 'ForbiddenError';
}

export class NotFoundError extends HttpError {
    readonly statusCode = HttpStatusCodes.NOT_FOUND;
    readonly errorType = 'NotFoundError';
    name = 'NotFoundError';
}

export class InternalServerError extends HttpError {
    readonly statusCode = HttpStatusCodes.INTERNAL_SERVER_ERROR;
    readonly errorType = 'InternalServerError';
    name = 'InternalServerError';
}

export class ServiceUnavailableError extends HttpError {
    readonly statusCode = HttpStatusCodes.SERVICE_UNAVAILABLE;
    readonly errorType = 'ServiceUnavailableError';
    name = 'ServiceUnavailableError';
}
