import {sql} from 'drizzle-orm';
import {mcpDb, withRlsTransaction} from '../client';
import {gitgazerMcp} from '../schema';
import type {MemberRole} from '../types/members';

export const DEFAULT_ROW_CAP = 1000;
export const DEFAULT_STATEMENT_TIMEOUT_S = 10;

export type ReadOnlyQueryResult = {
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    /** True when more rows existed than `rowCap`; `rows` is capped to `rowCap`. */
    truncated: boolean;
};

export class ReadOnlyQueryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReadOnlyQueryError';
    }
}

// Leading whitespace/comments — stripped only to inspect the first keyword.
const LEADING_NOISE = /^(?:\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/;

// PostgreSQL nests block comments and LEADING_NOISE does not: in `/* /* */ SELECT 1 */ DELETE …` the regex
// sees a SELECT while Postgres sees the DELETE. Rejected rather than parsed; no real query needs it.
const NESTED_BLOCK_COMMENT = /\/\*(?:(?!\*\/)[\s\S])*\/\*/;

// Defence in depth, not the boundary (that is the gitgazer_mcp login, RLS and the read-only transaction), and a
// text match cannot see a name assembled at runtime. It still guards the rls.integration_ids / rls.integration_roles
// GUCs, because set_config stays executable on Aurora (the revoke migration is a no-op there):
// - `set_config` and `pg_settings`, whose UPDATE rule reaches set_config without naming it;
// - functions that execute a caller-supplied SQL string (`*_to_xml*`, `dblink*`, `ts_stat`, `ts_rewrite`), where a
//   concatenated `'set_con' || 'fig(...)'` never shows the literal token;
// - `pg_advisory_*`: a session-level lock is legal in a READ ONLY transaction and outlives it, so it goes
//   back into the pool with the connection;
// - `pg_stat_*`, which leaks other tenants' in-flight SQL + UUIDs since every request shares the gitgazer_mcp role;
// - file, large-object, sleep and backend-control functions.
// The `SET`/`RESET` statements are deliberately NOT listed — they need a `;` to run, which
// assertReadOnlySelect already rejects, and blocklisting the words would false-positive on `%reset%`.
const BLOCKED_TOKENS =
    /\b(?:set_config|pg_settings|\w*_to_xml\w*|ts_stat|ts_rewrite|dblink\w*|pg_(?:try_)?advisory_\w*|pg_sleep\w*|pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_\w+|lo_\w+|loread|lowrite|pg_terminate_backend|pg_cancel_backend)\b/i;

// SQL-standard Unicode-escape introducer (`U&'…'` / `U&"…"`). It lets an identifier or string be
// spelled with `\XXXX` character escapes — e.g. `U&"\0073et_config"` resolves to the identifier
// `set_config` at parse time while the raw text never contains the literal token, defeating
// BLOCKED_TOKENS. Legitimate analytics queries never need it, so it is rejected outright.
const UNICODE_ESCAPE = /u&['"]/i;

/**
 * Validate that a string is a SINGLE read-only SELECT/WITH statement and return it with any
 * trailing semicolons removed. Throws `ReadOnlyQueryError` otherwise.
 *
 * Rejecting an embedded `;` is the crux of the tenant boundary: `runReadOnlyQuery` executes the
 * wrapped query with no bind parameters, so node-postgres uses the simple query protocol, which
 * would otherwise run multiple `;`-separated statements — letting a caller break out of the wrap
 * and `SET rls.integration_ids` to another tenant. The subquery-wrap alone does NOT prevent this.
 */
export function assertReadOnlySelect(rawSql: string): string {
    const trimmed = rawSql
        .trim()
        .replace(/;+\s*$/, '')
        .trim();
    if (!trimmed) {
        throw new ReadOnlyQueryError('Query is empty');
    }
    if (trimmed.includes(';')) {
        throw new ReadOnlyQueryError('Only a single statement is allowed (no ";")');
    }
    const leading = LEADING_NOISE.exec(trimmed)?.[0] ?? '';
    if (NESTED_BLOCK_COMMENT.test(leading)) {
        throw new ReadOnlyQueryError('Query uses nested block comments, which are not supported');
    }
    if (!/^(?:select|with)\b/i.test(trimmed.slice(leading.length))) {
        throw new ReadOnlyQueryError('Only read-only SELECT/WITH queries are allowed');
    }
    if (UNICODE_ESCAPE.test(trimmed)) {
        throw new ReadOnlyQueryError('Query uses unsupported Unicode-escape syntax');
    }
    if (BLOCKED_TOKENS.test(trimmed)) {
        throw new ReadOnlyQueryError('Query references a blocked statement or function');
    }
    return trimmed;
}

// Postgres SQLSTATE for a statement aborted by `statement_timeout` (query_canceled). Handled
// specially below with a bespoke, actionable message rather than the raw driver text.
const STATEMENT_TIMEOUT_CODE = '57014';

// Insufficient-privilege: deliberately NOT surfaced. Its message can reveal tables/roles a tenant
// cannot see, so it stays a generic "Tool execution failed" (logged server-side by the MCP layer).
// Flip this by dropping it from isClientActionable if you decide the clearer message is worth it.
const INSUFFICIENT_PRIVILEGE_CODE = '42501';

// Read-only-transaction violation — e.g. a write smuggled in via a data-modifying CTE that slips
// past assertReadOnlySelect but is then rejected by SET TRANSACTION READ ONLY. Surfaced so the
// caller learns why instead of seeing a generic failure.
const READ_ONLY_VIOLATION_CODE = '25006';

/**
 * Whether a SQLSTATE's primary message is safe + useful to echo back so an (LLM) caller can
 * self-correct: class 22 (data exceptions — bad literals, division by zero, …) and class 42
 * (syntax errors, undefined column/table/function), plus the read-only violation. 42501
 * (insufficient_privilege) is excluded on purpose to avoid leaking schema/role internals.
 */
const isClientActionable = (code: string): boolean => {
    if (code === INSUFFICIENT_PRIVILEGE_CODE) return false;
    if (code === READ_ONLY_VIOLATION_CODE) return true;
    return code.startsWith('22') || code.startsWith('42');
};

type PgError = {code: string; message: string};

/**
 * Walk the error's `cause` chain (node-postgres raises the driver error, which drizzle re-wraps as
 * the `cause` of a "Failed query: …" Error) and return the first Postgres error — an object carrying
 * a 5-char SQLSTATE `code` — as `{code, message}`, or `undefined` if none is present. Only the
 * primary `message` is read; `detail`/`hint` (the leakier fields) are never surfaced.
 */
const findPgError = (error: unknown): PgError | undefined => {
    for (let current: unknown = error, depth = 0; current != null && depth < 5; depth++) {
        if (typeof current !== 'object') break;
        const code = (current as {code?: unknown}).code;
        if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
            const message = (current as {message?: unknown}).message;
            return {code, message: typeof message === 'string' ? message : ''};
        }
        current = (current as {cause?: unknown}).cause;
    }
    return undefined;
};

/**
 * Execute an arbitrary read-only SQL query for an MCP client, bounded by the caller's Postgres
 * role permissions and a per-query budget.
 *
 * Tenant isolation is layered (defense-in-depth):
 *  1. assertReadOnlySelect — the single-SELECT guarantee (this, NOT the wrap, stops `;` stacking) plus a
 *     function blocklist, which is a mitigation, not a proof.
 *  2. subquery-wrap `SELECT * FROM (<sql>) _mcp LIMIT <cap+1>` — SELECT context + row cap.
 *  3. the `mcpDb` connection, logged in as gitgazer_mcp, so the session cannot switch to a role that owns
 *     the tables or bypasses RLS (IAM connection mode; the Data API mode has no separate login).
 *  4. READ ONLY txn, `SET LOCAL ROLE gitgazer_mcp` (GRANTs), `SET LOCAL rls.integration_ids` and
 *     `rls.integration_roles` (RLS), and a statement_timeout. set_config stays executable on Aurora,
 *     so those settings rest on guard 1.
 */
export async function runReadOnlyQuery(params: {
    sql: string;
    integrationRoles: Record<string, MemberRole>;
    rowCap?: number;
    statementTimeoutS?: number;
}): Promise<ReadOnlyQueryResult> {
    const rowCap = params.rowCap ?? DEFAULT_ROW_CAP;
    if (!Number.isInteger(rowCap) || rowCap <= 0) {
        throw new ReadOnlyQueryError('rowCap must be a positive integer');
    }
    const statementTimeoutS = params.statementTimeoutS ?? DEFAULT_STATEMENT_TIMEOUT_S;
    const userSql = assertReadOnlySelect(params.sql);

    try {
        return await withRlsTransaction({
            integrationIds: Object.keys(params.integrationRoles),
            integrationRoles: params.integrationRoles,
            userName: gitgazerMcp.name,
            client: mcpDb,
            readOnly: true,
            statementTimeoutS,
            callback: async (tx) => {
                // The newline before `)` neutralizes any trailing line comment in userSql.
                const wrapped = sql.raw(`SELECT * FROM (\n${userSql}\n) AS _mcp LIMIT ${rowCap + 1}`);
                const result = (await tx.execute(wrapped)) as {rows?: Record<string, unknown>[]; fields?: {name: string}[]};

                const allRows = result.rows ?? [];
                const truncated = allRows.length > rowCap;
                const rows = truncated ? allRows.slice(0, rowCap) : allRows;
                const columns = result.fields?.map((f) => f.name) ?? (rows[0] ? Object.keys(rows[0]) : []);

                return {columns, rows, rowCount: rows.length, truncated};
            },
        });
    } catch (error) {
        // Translate caller-caused Postgres errors into ReadOnlyQueryError so the MCP layer echoes an
        // actionable message to the client instead of a generic "Tool execution failed". Anything not
        // recognized here is rethrown as-is (logged server-side, returned generically to the client).
        const pg = findPgError(error);
        if (pg?.code === STATEMENT_TIMEOUT_CODE) {
            throw new ReadOnlyQueryError(
                `Query canceled: it exceeded the ${statementTimeoutS}s statement timeout. ` +
                    'Simplify it or narrow the scope — add filters (e.g. integration_id, repository, a date range) or a smaller LIMIT.',
            );
        }
        if (pg && pg.message && isClientActionable(pg.code)) {
            throw new ReadOnlyQueryError(`Query failed: ${pg.message}`);
        }
        throw error;
    }
}
