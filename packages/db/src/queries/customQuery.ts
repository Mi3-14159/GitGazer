import {sql} from 'drizzle-orm';
import {withRlsTransaction} from '../client';
import type {CustomQueryColumn, CustomQueryResponse, TableSchema} from '../types/metrics';

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|CALL)\b/i;
const MAX_ROWS = 1000;

function validateQuery(query: string): void {
    const trimmed = query.trim().replace(/;+$/, '').trim();
    if (!trimmed) {
        throw new Error('Query cannot be empty');
    }
    if (FORBIDDEN_KEYWORDS.test(trimmed)) {
        throw new Error('Only SELECT queries are allowed. DDL and DML statements are not permitted.');
    }
}

export async function executeCustomQuery({integrationIds, query}: {integrationIds: string[]; query: string}): Promise<CustomQueryResponse> {
    validateQuery(query);

    return await withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            await tx.execute(sql.raw(`SET LOCAL statement_timeout = '10s'`));
            await tx.execute(sql.raw('SET TRANSACTION READ ONLY'));

            const wrappedQuery = `SELECT * FROM (${query.trim().replace(/;+$/, '')}) AS _user_query LIMIT ${MAX_ROWS}`;
            const result = await tx.execute(sql.raw(wrappedQuery));

            const rows = result.rows as Record<string, unknown>[];
            const columns: CustomQueryColumn[] =
                rows.length > 0
                    ? Object.keys(rows[0]).map((name) => ({
                          name,
                          type: typeof rows[0][name] === 'number' ? 'number' : typeof rows[0][name] === 'boolean' ? 'boolean' : 'string',
                      }))
                    : [];

            return {
                columns,
                rows,
                rowCount: rows.length,
            };
        },
    });
}

export async function getAvailableSchema({integrationIds}: {integrationIds: string[]}): Promise<TableSchema[]> {
    return await withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const result = await tx.execute(
                sql`SELECT table_schema, table_name, column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema IN ('github')
                    ORDER BY table_schema, table_name, ordinal_position`,
            );

            const rows = result.rows as {table_schema: string; table_name: string; column_name: string; data_type: string}[];
            const tableMap = new Map<string, TableSchema>();

            for (const row of rows) {
                const key = `${row.table_schema}.${row.table_name}`;
                if (!tableMap.has(key)) {
                    tableMap.set(key, {
                        schema: row.table_schema,
                        table: row.table_name,
                        columns: [],
                    });
                }
                tableMap.get(key)!.columns.push({
                    name: row.column_name,
                    type: row.data_type,
                });
            }

            return Array.from(tableMap.values());
        },
    });
}
