import {sql, TransactionRollbackError, type SQL} from 'drizzle-orm';
import {mcpDb, withRlsTransaction} from '../client';
import {gitgazerMcp} from '../schema';
import type {MemberRole} from '../types/members';

export const DEFAULT_ROW_CAP = 1000;
export const DEFAULT_STATEMENT_TIMEOUT_S = 10;
export const BYTE_BUDGET = 128 * 1024;

export type ReadOnlyQueryResult = {
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    /** True when rows were dropped by the row cap or the byte budget. */
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
// The `SET`/`RESET` statements are deliberately NOT listed — they need a second statement, which Postgres refuses
// for the bound wrapReadOnlyQuery, and blocklisting the words would false-positive on `%reset%`.
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
 * Rejecting an embedded `;` is defence in depth with a clear message: the bind parameters in
 * wrapReadOnlyQuery are what stop a caller from stacking `SET rls.integration_ids` after the wrap.
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
    // A `$n` would bind to the wrap's own parameters.
    if (/\$\d/.test(trimmed)) {
        throw new ReadOnlyQueryError('Bind-parameter placeholders ($1, $2, …) are not supported; inline the values');
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

/**
 * The byte budget and LIMIT are bind parameters on purpose: with parameters node-postgres uses the extended query
 * protocol, where Postgres refuses more than one command per statement, which is what makes statement stacking
 * impossible. Never interpolate them. The newline before `)` neutralizes a trailing line comment in userSql.
 *
 * The running byte sum has to filter in the database: node-postgres buffers the whole result before any JavaScript
 * sees it, so a huge row must never leave Postgres. The filter drops a suffix, invisible to the row count, so
 * `_mcp_more` (a one-row look-ahead) on the last kept row tells the caller that a following row was dropped.
 * The LIMIT sits inside the window: Postgres cannot tell that the running sum only grows, so a LIMIT above the
 * filter would not stop it from reading and text-converting the whole input. `(_mcp.*)::text` rather than
 * `_mcp::text`, which would resolve to a caller column named `_mcp`.
 *
 * When no row fits the budget, the LEFT JOIN from the one-row anchor returns a single sentinel row of NULLs whose
 * `_mcp_any` says whether the query had rows at all, so a dropped first row is still flagged in one statement.
 * MATERIALIZED makes the anchor and the window read the same single evaluation of the caller's query.
 */
export const wrapReadOnlyQuery = (userSql: string, rowCap: number): SQL =>
    sql`WITH _mcp AS MATERIALIZED (SELECT * FROM (\n${sql.raw(userSql)}\n) AS _mcp_inner LIMIT ${rowCap + 1}) SELECT _mcp_budget.*, _mcp_anchor._mcp_any FROM (SELECT EXISTS (SELECT FROM _mcp) AS _mcp_any) AS _mcp_anchor LEFT JOIN (SELECT _mcp.*, sum(octet_length((_mcp.*)::text)) OVER (ROWS UNBOUNDED PRECEDING) AS _mcp_bytes, lead(1) OVER () AS _mcp_more FROM _mcp) AS _mcp_budget ON _mcp_bytes <= ${BYTE_BUDGET}`;

/**
 * Strip the wrap's bookkeeping columns and apply both limits again to what came back, so the payload never exceeds
 * BYTE_BUDGET: a row that does not fit is dropped, even the first one.
 */
const limitRows = (rows: Record<string, unknown>[], rowCap: number): Pick<ReadOnlyQueryResult, 'rows' | 'truncated'> => {
    // A real row always has a byte count; NULL marks the sentinel.
    if (rows[0] && rows[0]._mcp_bytes == null) {
        return {rows: [], truncated: rows[0]._mcp_any === true};
    }
    let truncated = rows.length > rowCap || rows[rows.length - 1]?._mcp_more != null;
    const kept: Record<string, unknown>[] = [];
    let bytes = 0;
    for (const {_mcp_bytes, _mcp_more, _mcp_any, ...row} of rows.slice(0, rowCap)) {
        bytes += Buffer.byteLength(JSON.stringify(row));
        if (bytes > BYTE_BUDGET) {
            truncated = true;
            break;
        }
        kept.push(row);
    }
    return {rows: kept, truncated};
};

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
 *  1. assertReadOnlySelect — SELECT/WITH shape, `;` and `$n` rejection and a function blocklist, which is a
 *     mitigation, not a proof.
 *  2. wrapReadOnlyQuery `WITH _mcp AS MATERIALIZED (SELECT * FROM (<sql>) _mcp_inner LIMIT $1) …` with the byte
 *     budget as $2 — the bound parameters force the extended protocol, so Postgres refuses stacked statements; the
 *     subquery gives SELECT context, the row cap and the in-database byte budget.
 *  3. the `mcpDb` connection, logged in as gitgazer_mcp, so the session cannot switch to a role that owns
 *     the tables or bypasses RLS (IAM connection mode; the Data API mode has no separate login).
 *  4. READ ONLY txn that is always rolled back, `SET LOCAL ROLE gitgazer_mcp` (GRANTs), `SET LOCAL rls.integration_ids`
 *     and `rls.integration_roles` (RLS), and statement and lock timeouts. set_config stays executable on Aurora,
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

    let result: ReadOnlyQueryResult | undefined;
    try {
        return await withRlsTransaction({
            integrationIds: Object.keys(params.integrationRoles),
            integrationRoles: params.integrationRoles,
            userName: gitgazerMcp.name,
            client: mcpDb,
            readOnly: true,
            statementTimeoutS,
            lockTimeoutS: 2,
            callback: async (tx) => {
                const raw = (await tx.execute(wrapReadOnlyQuery(userSql, rowCap))) as {
                    rows?: Record<string, unknown>[];
                    fields?: {name: string}[];
                };

                const {rows, truncated} = limitRows(raw.rows ?? [], rowCap);
                const columns = raw.fields?.slice(0, -3).map((f) => f.name) ?? Object.keys(rows[0] ?? {});
                result = {columns, rows, rowCount: rows.length, truncated};

                return tx.rollback();
            },
        });
    } catch (error) {
        // tx.rollback() ends every successful run by throwing this; nothing an MCP query does is meant to persist.
        if (error instanceof TransactionRollbackError && result) return result;

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
