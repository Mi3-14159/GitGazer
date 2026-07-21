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

// Blocklist of host-reading / cross-tenant-leaking FUNCTIONS callable inside a SELECT: `set_config`
// (could overwrite the rls.integration_ids tenant GUC) and the `pg_stat_*` family (leaks other
// tenants' in-flight SQL + UUIDs, since every request shares the gitgazer_mcp role). The `SET`/`RESET`
// statements are deliberately NOT listed — they need a `;` to run, which assertReadOnlySelect already
// rejects, and blocklisting the words would false-positive on searches like `%reset%`.
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
 * Execute an arbitrary read-only SQL query for an MCP client, bounded by the caller's Postgres
 * role permissions and a per-query budget.
 *
 * Tenant isolation is layered (defense-in-depth):
 *  1. assertReadOnlySelect — the single-SELECT guarantee (this, NOT the wrap, stops `;` stacking).
 *  2. subquery-wrap `SELECT * FROM (<sql>) _mcp LIMIT <cap+1>` — SELECT context + row cap.
 *  3. READ ONLY txn, `SET LOCAL ROLE gitgazer_mcp` (GRANTs), `SET LOCAL rls.integration_ids` (RLS),
 *     and a statement_timeout — the actual tenant / permission / DoS boundary.
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
