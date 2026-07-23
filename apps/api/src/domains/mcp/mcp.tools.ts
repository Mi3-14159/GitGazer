import type {McpCaller} from '@/domains/mcp/mcp.controller';
import {chargeQueryBudget, QuotaExceededError, reserveQueryBudget} from '@/domains/mcp/mcp.quota';
import {runReadOnlyQuery, type ReadOnlyQueryResult} from '@gitgazer/db/queries';

/** MCP tool-call result shape (a single text block holding the JSON payload). */
export type McpToolResult = {content: {type: 'text'; text: string}[]; isError?: boolean};

export class McpToolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'McpToolError';
    }
}

type McpTool = {
    name: string;
    description: string;
    inputSchema: {type: 'object'; properties: Record<string, unknown>; required?: string[]};
};

/** Advertised tools (all read-only, executed under the gitgazer_mcp role + RLS). */
export const MCP_TOOLS: McpTool[] = [
    {
        name: 'run_sql',
        description:
            'Run a single read-only SQL SELECT (or WITH … SELECT) against your GitGazer data in the "github" schema: ' +
            'workflow_runs, workflow_jobs, workflow_run_pull_requests, pull_requests, repositories, organizations, ' +
            'enterprises, "user", and integrations. Tenant isolation, row caps and a statement timeout are enforced ' +
            'automatically. Use list_tables and describe_table to explore what is available.',
        inputSchema: {
            type: 'object',
            properties: {sql: {type: 'string', description: 'A single read-only SELECT or WITH statement.'}},
            required: ['sql'],
        },
    },
    {
        name: 'list_tables',
        description: 'List the tables you are allowed to query (schema + table name).',
        inputSchema: {type: 'object', properties: {}},
    },
    {
        name: 'describe_table',
        description: 'List the columns (name, type, nullability) of a table you can query.',
        inputSchema: {
            type: 'object',
            properties: {table: {type: 'string', description: 'Unqualified table name, e.g. workflow_runs.'}},
            required: ['table'],
        },
    },
    {
        name: 'list_integrations',
        description: 'List the GitGazer integrations (tenants) you have access to.',
        inputSchema: {type: 'object', properties: {}},
    },
];

// describe_table interpolates the table name into a fixed introspection query; restrict it to a
// bare identifier (the role + read-only txn are the real guard, this just closes the surface).
const IDENTIFIER = /^[A-Za-z0-9_]+$/;

const toResult = (result: ReadOnlyQueryResult): McpToolResult => ({content: [{type: 'text', text: JSON.stringify(result)}]});

/** Dispatch a tool call. Every tool runs through `runReadOnlyQuery`, so the gitgazer_mcp
 * role GRANTs + RLS are the single enforcement point. */
export const runToolCall = async (name: string, args: Record<string, unknown>, caller: McpCaller): Promise<McpToolResult> => {
    const {integrationIds} = caller;
    switch (name) {
        case 'run_sql': {
            const sql = args.sql;
            if (typeof sql !== 'string' || !sql.trim()) {
                throw new McpToolError("'sql' must be a non-empty string");
            }
            const reservation = await reserveQueryBudget(caller.userId).catch((error: unknown) => {
                if (error instanceof QuotaExceededError) throw new McpToolError(error.message);
                throw error;
            });
            // Charge on every outcome (success, error, or timeout) so expensive queries can't run for free.
            const start = Date.now();
            const outcome = await runReadOnlyQuery({sql, integrationIds, statementTimeoutS: reservation.maxQuerySeconds}).then(
                (result) => ({result}),
                (error: unknown) => ({error}),
            );
            const budget = await chargeQueryBudget(reservation, Date.now() - start);
            if ('error' in outcome) throw outcome.error;
            return {content: [{type: 'text', text: JSON.stringify({...outcome.result, budget})}]};
        }
        case 'list_tables':
            return toResult(
                await runReadOnlyQuery({
                    sql: "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'github' ORDER BY table_name",
                    integrationIds,
                }),
            );
        case 'describe_table': {
            const table = args.table;
            if (typeof table !== 'string' || !IDENTIFIER.test(table)) {
                throw new McpToolError("'table' must be a simple table name");
            }
            return toResult(
                await runReadOnlyQuery({
                    sql: `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'github' AND table_name = '${table}' ORDER BY ordinal_position`,
                    integrationIds,
                }),
            );
        }
        case 'list_integrations':
            return toResult(
                await runReadOnlyQuery({
                    sql: 'SELECT integration_id, label, created_at FROM github.integrations ORDER BY label',
                    integrationIds,
                }),
            );
        default:
            throw new McpToolError(`Unknown tool: ${name}`);
    }
};
