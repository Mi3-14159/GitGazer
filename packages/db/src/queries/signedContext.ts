import {sql} from 'drizzle-orm';
import type {RdsTransaction} from '../client';
import {isMemberRole, type MemberRole} from '../types/members';

export const INTEGRATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

/** A server-side failure to sign the tenant context: never the caller's fault, so never echoed to the caller. */
export class SignedContextError extends Error {
    constructor(
        message: string,
        readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'SignedContextError';
    }
}

/** The verifier in github.signed_context() accepts only lowercase UUIDs, so the ids are lowercased. */
export const contextPayload = (integrationRoles: Record<string, MemberRole>): string =>
    Object.entries(integrationRoles)
        .map(([id, role]) => {
            if (!INTEGRATION_ID_PATTERN.test(id)) {
                throw new Error(`Invalid integration ID: ${id}`);
            }
            if (!isMemberRole(role)) {
                throw new Error(`Invalid integration role: ${role}`);
            }
            return `${id.toLowerCase()}:${role}`;
        })
        .join(',');

/**
 * Sign the payload for the session and transaction `tx` runs in and set it as rls.signed_context. `signer` must be logged
 * in as the app login, the only one that may execute the sign function; the bigint transaction start stays a string to
 * keep its precision.
 */
export const setSignedContext = async (tx: RdsTransaction, payload: string, signer: Pick<RdsTransaction, 'execute'>): Promise<void> => {
    const session = (await tx.execute(
        sql`SELECT pg_backend_pid() AS pid, (extract(epoch FROM now()) * 1000000)::bigint::text AS txn_start_us`,
    )) as unknown as {rows: {pid: number; txn_start_us: string}[]};
    const {pid, txn_start_us} = session.rows[0];
    const signed = (await signer
        .execute(sql`SELECT gitgazer_internal.sign_context(${payload}, ${pid}::integer, ${txn_start_us}::bigint) AS signature`)
        .catch((error: unknown) => {
            throw new SignedContextError('Could not sign the tenant context', error);
        })) as unknown as {rows: {signature?: unknown}[]};
    const signature = signed.rows[0]?.signature;
    if (typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature)) {
        throw new SignedContextError('Signing the tenant context returned an invalid signature');
    }
    await tx.execute(sql.raw(`SET LOCAL rls.signed_context = '${payload}|${signature}';`));
};
