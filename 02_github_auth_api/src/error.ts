export class BaseError extends Error {
    readonly name: string;
    readonly ctx: unknown;

    constructor(name: string, msg: string, ctx?: unknown) {
        super(msg);
        this.name = name;
        this.ctx = ctx;

        Object.setPrototypeOf(this, BaseError.prototype);
    }
}
