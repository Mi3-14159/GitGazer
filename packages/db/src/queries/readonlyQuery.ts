import {sql} from 'drizzle-orm';
import {withRlsTransaction} from '../client';
import {gitgazerAnalyst} from '../schema';

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

// Defense-in-depth: session-mutating / host-reading functions callable inside a SELECT.
// The real boundary is the analyst role's GRANTs + the `set_config` REVOKE (Phase C).
const BLOCKED_TOKENS =
    /\b(?:set_config|pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|dblink|pg_terminate_backend|pg_cancel_backend)\b/i;

/**
 * Validate that a string is a single read-only SELECT/WITH query and return it with any
 * trailing semicolons removed. Throws `ReadOnlyQueryError` otherwise. This is a lightweight
 * guard; the hard guarantees come from the execution layer in `runReadOnlyQuery`.
 */
export function assertReadOnlySelect(rawSql: string): string {
    const trimmed = rawSql
        .trim()
        .replace(/;+\s*$/, '')
        .trim();
    if (!trimmed) {
        throw new ReadOnlyQueryError('Query is empty');
    }
    const firstKeyword = trimmed.replace(LEADING_NOISE, '');
    if (!/^(?:select|with)\b/i.test(firstKeyword)) {
        throw new ReadOnlyQueryError('Only read-only SELECT/WITH queries are allowed');
    }
    if (BLOCKED_TOKENS.test(trimmed)) {
        throw new ReadOnlyQueryError('Query references a blocked function');
    }
    return trimmed;
}

/**
 * Execute an arbitrary read-only SQL query on behalf of an MCP client, bounded by the
 * caller's Postgres role permissions and a per-query budget.
 *
 * Safety model (defense-in-depth):
 *  1. `assertReadOnlySelect` — must be a single SELECT/WITH; blocked functions rejected.
 *  2. Subquery-wrap `SELECT * FROM (<sql>) _mcp LIMIT <cap+1>` — structurally forbids
 *     statement stacking / non-SELECT statements and caps the row count.
 *  3. `SET TRANSACTION READ ONLY` — no writes.
 *  4. `SET LOCAL ROLE gitgazer_analyst` — GRANTs restrict which tables/columns are visible.
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
        userName: gitgazerAnalyst.name,
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
