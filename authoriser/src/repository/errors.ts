import {BaseError} from '../error';

export class RepositoryError extends BaseError {
    constructor(message: string, ctx?: unknown) {
        super('Repository error', message, ctx);
        Object.setPrototypeOf(this, RepositoryError.prototype);
    }
}
