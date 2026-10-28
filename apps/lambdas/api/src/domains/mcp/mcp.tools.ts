import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';
import {mcpUserId, type McpCaller} from '@/domains/mcp/mcp.controller';
import {chargeQueryBudget, QuotaExceededError, reserveQueryBudget} from '@/domains/mcp/mcp.quota';
import {getLogger} from '@gitgazer/backend-core/logger';
import {ReadOnlyQueryError, runReadOnlyQuery} from '@gitgazer/db/queries';
import type {CallToolResult, McpServer, ServerContext} from '@modelcontextprotocol/server';
import {DrizzleQueryError} from 'drizzle-orm/errors';
import {z} from 'zod';

export class McpToolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'McpToolError';
    }
}

const textResult = (text: string, isError?: true): CallToolResult => ({content: [{type: 'text', text}], ...(isError && {isError})});

// Only messages from trusted error types are echoed; anything else (raw DB/Postgres errors) is
// logged server-side and returned generically so schema/role internals don't leak to the client.
const isSafeError = (error: unknown): error is Error =>
    error instanceof McpToolError ||
    error instanceof ReadOnlyQueryError ||
    (error instanceof DrizzleQueryError && error.cause != null && 'code' in error.cause && error.cause.code === '42501'); // permission denied

/** Resolves the caller, runs the tool, and reports failures in-band (MCP convention) instead of as JSON-RPC errors. */
const toolHandler =
    <Args>(tool: string, run: (args: Args, caller: McpCaller) => Promise<unknown>) =>
    async (args: Args, ctx: ServerContext): Promise<CallToolResult> => {
        try {
            const userId = mcpUserId(ctx.http?.authInfo);
            const caller = {userId, integrationRoles: await getUserIntegrationRoles(userId)};
            return textResult(JSON.stringify(await run(args, caller)));
        } catch (error) {
            if (isSafeError(error)) return textResult(error.message, true);
            getLogger().error('MCP tool call failed', {tool, error});
            return textResult('Tool execution failed', true);
        }
    };

/** Registers the tools (all read-only). Every tool runs through `runReadOnlyQuery`, so the
 * gitgazer_mcp role GRANTs + RLS are the single enforcement point. */
export const registerMcpTools = (server: McpServer): void => {
    server.registerTool(
        'run_sql',
        {
            description:
                'Run a single read-only SQL SELECT (or WITH … SELECT) against your GitGazer data in the "github" schema: ' +
                'workflow_runs, workflow_jobs, workflow_run_pull_requests, pull_requests, repositories, organizations, ' +
                'enterprises, "user", and integrations. Tenant isolation, a row cap, a 128 KB result size limit and a statement ' +
                'timeout are enforced automatically; truncated: true means rows were dropped. Use list_tables and ' +
                'describe_table to explore what is available.',
            inputSchema: z.object({sql: z.string().min(1).describe('A single read-only SELECT or WITH statement.')}),
            annotations: {readOnlyHint: true},
        },
        toolHandler('run_sql', async ({sql}, caller) => {
            if (!sql.trim()) throw new McpToolError("'sql' must be a non-empty string");
            const reservation = await reserveQueryBudget(caller.userId).catch((error: unknown) => {
                if (error instanceof QuotaExceededError) throw new McpToolError(error.message);
                throw error;
            });
            // Charge on every outcome (success, error, or timeout) so expensive queries can't run for free.
            const start = Date.now();
            const outcome = await runReadOnlyQuery({
                sql,
                integrationRoles: caller.integrationRoles,
                statementTimeoutS: reservation.maxQuerySeconds,
            }).then(
                (result) => ({result}),
                (error: unknown) => ({error}),
            );
            const budget = await chargeQueryBudget(reservation, Date.now() - start);
            if ('error' in outcome) throw outcome.error;
            return {...outcome.result, budget};
        }),
    );

    server.registerTool(
        'list_tables',
        {
            description: 'List the tables you are allowed to query (schema + table name).',
            inputSchema: z.object({}),
            annotations: {readOnlyHint: true},
        },
        toolHandler('list_tables', (_args, {integrationRoles}) =>
            runReadOnlyQuery({
                sql: "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'github' ORDER BY table_name",
                integrationRoles,
            }),
        ),
    );

    server.registerTool(
        'describe_table',
        {
            description: 'List the columns (name, type, nullability) of a table you can query.',
            // The table name is interpolated into a fixed introspection query; restricting it to a bare
            // identifier closes the surface (the role + read-only txn are the real guard).
            inputSchema: z.object({
                table: z
                    .string()
                    .regex(/^[A-Za-z0-9_]+$/)
                    .describe('Unqualified table name, e.g. workflow_runs.'),
            }),
            annotations: {readOnlyHint: true},
        },
        toolHandler('describe_table', ({table}, {integrationRoles}) =>
            runReadOnlyQuery({
                sql: `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'github' AND table_name = '${table}' ORDER BY ordinal_position`,
                integrationRoles,
            }),
        ),
    );
};
