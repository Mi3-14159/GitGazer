import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';
import {mcpUserId, type McpCaller} from '@/domains/mcp/mcp.controller';
import {chargeQueryBudget, QuotaExceededError, reserveQueryBudget} from '@/domains/mcp/mcp.quota';
import {getLogger} from '@gitgazer/backend-core/logger';
import {ReadOnlyQueryError, runReadOnlyQuery} from '@gitgazer/db/queries';
import type {CallToolResult, McpServer, ServerContext, StandardSchemaWithJSON, ToolCallback} from '@modelcontextprotocol/server';
import {z} from 'zod';

export class McpToolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'McpToolError';
    }
}

// Bounds the work assertReadOnlySelect does per call; no real query comes close.
const SQL_MAX_LENGTH = 10_000;

const textResult = (text: string, isError?: true): CallToolResult => ({content: [{type: 'text', text}], ...(isError && {isError})});

// Only messages from trusted error types are echoed; anything else (raw DB/Postgres errors) is
// logged server-side and returned generically so schema/role internals don't leak to the client.
const isSafeError = (error: unknown): error is Error => error instanceof McpToolError || error instanceof ReadOnlyQueryError;

type ToolArgs<Schema extends StandardSchemaWithJSON> = StandardSchemaWithJSON.InferOutput<Schema>;

/** Registers a read-only tool whose handler resolves the caller and reports failures in-band (MCP convention) instead of as JSON-RPC errors. */
const registerTool = <Schema extends StandardSchemaWithJSON>(
    server: McpServer,
    name: string,
    config: {description: string; inputSchema: Schema},
    run: (args: ToolArgs<Schema>, caller: McpCaller) => Promise<unknown>,
): void => {
    const handler = async (args: ToolArgs<Schema>, ctx: ServerContext): Promise<CallToolResult> => {
        try {
            const userId = mcpUserId(ctx.http?.authInfo);
            const caller = {userId, integrationRoles: await getUserIntegrationRoles(userId)};
            return textResult(JSON.stringify(await run(args, caller)));
        } catch (error) {
            if (isSafeError(error)) return textResult(error.message, true);
            getLogger().error('MCP tool call failed', {tool: name, error});
            return textResult('Tool execution failed', true);
        }
    };
    // ToolCallback is a conditional type that TS can't resolve while Schema is still generic.
    server.registerTool(name, {...config, annotations: {readOnlyHint: true}}, handler as ToolCallback<Schema>);
};

/** Registers the tools (all read-only). Every tool runs through `runReadOnlyQuery`, so the
 * gitgazer_mcp role GRANTs + RLS are the single enforcement point. */
export const registerMcpTools = (server: McpServer): void => {
    registerTool(
        server,
        'run_sql',
        {
            description:
                'Run a single read-only SQL SELECT (or WITH … SELECT) against your GitGazer data. Schema-qualify every table and view name. ' +
                'Tables in the "github" schema: ' +
                'workflow_runs, workflow_jobs, workflow_run_pull_requests, pull_requests, repositories, organizations, ' +
                'enterprises, pull_request_reviews, "user", and integrations. Configuration views: ' +
                'gitgazer.integration_apps_view, gitgazer.integration_app_github_settings_view, gitgazer.integration_app_slack_settings_view, ' +
                'gitgazer.notification_handles_view, gitgazer.webhook_handle_details_view, gitgazer.slack_handle_details_view, ' +
                'gitgazer.notification_rules_view, gitgazer.notification_rule_destinations_view, gitgazer.integration_invitations_view, ' +
                'gitgazer.event_log_entries_view, gitgazer.users_view, gitgazer.slack_workspaces_view, and github.user_assignments_view. ' +
                'Configuration views show only what your role in each integration ' +
                'allows; columns you may not see are NULL. Tenant isolation, a row cap, a 128 KB result size limit and a statement ' +
                'timeout are enforced automatically; truncated: true means rows were dropped. Use list_tables and ' +
                'describe_table to explore what is available.',
            inputSchema: z.object({
                sql: z.string().min(1).max(SQL_MAX_LENGTH).describe('A single read-only SELECT or WITH statement.'),
            }),
        },
        async ({sql}, caller) => {
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
        },
    );

    registerTool(
        server,
        'list_tables',
        {
            description: 'List the tables you are allowed to query (schema, table name, description).',
            inputSchema: z.object({}),
        },
        (_args, {integrationRoles}) =>
            runReadOnlyQuery({
                sql: "SELECT table_schema, table_name, obj_description(format('%I.%I', table_schema, table_name)::regclass, 'pg_class') AS description FROM information_schema.tables WHERE table_schema IN ('github', 'gitgazer') ORDER BY table_name",
                integrationRoles,
            }),
    );

    registerTool(
        server,
        'describe_table',
        {
            description: 'List the columns (name, type, nullability, description) of a table you can query.',
            // The table name is interpolated into a fixed introspection query; restricting it to a bare
            // identifier closes the surface (the role + read-only txn are the real guard).
            inputSchema: z.object({
                table: z
                    .string()
                    .regex(/^[A-Za-z0-9_]+$/)
                    .describe('Unqualified table or view name, e.g. workflow_runs or users_view.'),
            }),
        },
        ({table}, {integrationRoles}) =>
            runReadOnlyQuery({
                sql: `SELECT table_schema, column_name, data_type, is_nullable, col_description(format('%I.%I', table_schema, table_name)::regclass, ordinal_position::int) AS description FROM information_schema.columns WHERE table_schema IN ('github', 'gitgazer') AND table_name = '${table}' ORDER BY ordinal_position`,
                integrationRoles,
            }),
    );
};
