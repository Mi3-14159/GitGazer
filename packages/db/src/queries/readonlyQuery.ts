import {sql} from 'drizzle-orm';
import {withRlsTransaction} from '../client';
import {gitgazerMcp} from '../schema';

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

// Blocklist of host-reading / cross-tenant-leaking FUNCTIONS callable from inside a SELECT.
// `set_config` could overwrite the `rls.integration_ids` GUC (the tenant key); the `pg_stat_*`
// family (the view AND underlying `pg_stat_get_*` functions + `pg_stat_statements`) would leak
// other tenants' in-flight query text + integration UUIDs, since every MCP request shares the
// gitgazer_mcp role. NOTE: the `SET`/`RESET` *statements* need no blocklist entry — they can only
// run as a separate statement, which the single-`;` guard in `assertReadOnlySelect` already forbids
// (and blocklisting the words `set`/`reset` would false-positive on string searches like `%reset%`).
// (Migration 0056 also REVOKEs set_config where the platform allows.)
const BLOCKED_TOKENS =
    /\b(?:set_config|pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_\w+|lo_import|lo_export|dblink|pg_terminate_backend|pg_cancel_backend)\b/i;

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
    const firstKeyword = trimmed.replace(LEADING_NOISE, '');
    if (!/^(?:select|with)\b/i.test(firstKeyword)) {
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
 * Execute an arbitrary read-only SQL query on behalf of an MCP client, bounded by the
 * caller's Postgres role permissions and a per-query budget.
 *
 * Safety model (defense-in-depth):
 *  1. `assertReadOnlySelect` — a single SELECT/WITH only; rejects extra statements (`;`), blocked
 *     statements/functions, and Unicode-escape obfuscation. This provides the single-statement
 *     guarantee (the wrap below does NOT, under the simple query protocol).
 *  2. Subquery-wrap `SELECT * FROM (<sql>) _mcp LIMIT <cap+1>` — forces SELECT context + row cap.
 *  3. `SET TRANSACTION READ ONLY` — no writes.
 *  4. `SET LOCAL ROLE gitgazer_mcp` — GRANTs restrict which tables/columns are visible.
 *  5. `SET LOCAL rls.integration_ids` — RLS restricts rows to the caller's tenants.
 *  6. `statement_timeout` — bounds execution time.
 */
export async function runReadOnlyQuery(params: {
    sql: string;
    integrationIds: string[];
    rowCap?: number;
    statementTimeoutS?: number;
}): Promise<ReadOnlyQueryResult> {
    const rowCap = params.rowCap ?? DEFAULT_ROW_CAP;
    if (!Number.isInteger(rowCap) || rowCap <= 0) {
        throw new ReadOnlyQueryError('rowCap must be a positive integer');
    }
    const statementTimeoutS = params.statementTimeoutS ?? DEFAULT_STATEMENT_TIMEOUT_S;
    const userSql = assertReadOnlySelect(params.sql);

    return withRlsTransaction({
        integrationIds: params.integrationIds,
        userName: gitgazerMcp.name,
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
}
