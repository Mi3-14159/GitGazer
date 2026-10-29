import type {CallToolResult, McpServer} from '@modelcontextprotocol/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/queries', () => ({
    runReadOnlyQuery: vi.fn(),
    ReadOnlyQueryError: class ReadOnlyQueryError extends Error {},
}));
vi.mock('@/domains/mcp/mcp.quota', () => ({
    reserveQueryBudget: vi.fn(),
    chargeQueryBudget: vi.fn(),
    QuotaExceededError: class QuotaExceededError extends Error {},
}));
vi.mock('@/domains/integrations/integrations.controller', () => ({getUserIntegrationRoles: vi.fn()}));
vi.mock('@/shared/middleware/token-verifier', () => ({getMcpAccessVerifier: () => ({verify: vi.fn()})}));
vi.mock('@gitgazer/db/client', () => ({db: {select: vi.fn()}}));
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn()}}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const ID_A = '11111111-1111-1111-1111-111111111111';
const ROLES = {[ID_A]: 'viewer' as const};
const RESERVATION = {
    userId: 42,
    budgetMs: 600_000,
    windowSeconds: 3600,
    maxQuerySeconds: 60,
};
const BUDGET = {limit: 600, consumed: 1.5, remaining: 598.5, resetAt: '2026-07-21T01:00:00.000Z'};

type RegisteredTool = {
    config: {inputSchema: {safeParse: (input: unknown) => {success: boolean}}; annotations: {readOnlyHint?: boolean}};
    cb: (args: Record<string, unknown>, ctx: unknown) => Promise<CallToolResult>;
};

let readonly: typeof import('@gitgazer/db/queries');
let quota: typeof import('@/domains/mcp/mcp.quota');
let integrations: typeof import('@/domains/integrations/integrations.controller');
let tools: Map<string, RegisteredTool>;

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

const callTool = (name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> =>
    tools.get(name)!.cb(args, {http: {authInfo: {token: 't', clientId: 'c', scopes: [], extra: {userId: 42}}}});

const textOf = (result: CallToolResult): string => (result.content[0] as {text: string}).text;

describe('mcp tools', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        readonly = await import('@gitgazer/db/queries');
        quota = await import('@/domains/mcp/mcp.quota');
        integrations = await import('@/domains/integrations/integrations.controller');
        const {registerMcpTools} = await import('@/domains/mcp/mcp.tools');
        tools = new Map();
        const server = {registerTool: (name: string, config: RegisteredTool['config'], cb: RegisteredTool['cb']) => tools.set(name, {config, cb})};
        registerMcpTools(server as unknown as McpServer);

        asMock(integrations.getUserIntegrationRoles).mockResolvedValue(ROLES);
        asMock(readonly.runReadOnlyQuery).mockResolvedValue({columns: ['x'], rows: [{x: 1}], rowCount: 1, truncated: false});
        asMock(quota.reserveQueryBudget).mockResolvedValue(RESERVATION);
        asMock(quota.chargeQueryBudget).mockResolvedValue(BUDGET);
    });

    const lastSql = (): string => asMock(readonly.runReadOnlyQuery).mock.calls[0][0].sql;

    it('registers exactly the read-only tools', () => {
        expect([...tools.keys()]).toEqual(['run_sql', 'list_tables', 'describe_table']);
        expect([...tools.values()].every((t) => t.config.annotations.readOnlyHint)).toBe(true);
    });

    it('run_sql reserves budget, runs with the caller roles and max-query timeout, charges, and returns the budget', async () => {
        const res = await callTool('run_sql', {sql: 'SELECT 1 AS x'});
        expect(integrations.getUserIntegrationRoles).toHaveBeenCalledWith(42);
        expect(quota.reserveQueryBudget).toHaveBeenCalledWith(42);
        expect(readonly.runReadOnlyQuery).toHaveBeenCalledWith({sql: 'SELECT 1 AS x', integrationRoles: ROLES, statementTimeoutS: 60});
        expect(quota.chargeQueryBudget).toHaveBeenCalledWith(RESERVATION, expect.any(Number));
        expect(JSON.parse(textOf(res))).toEqual({columns: ['x'], rows: [{x: 1}], rowCount: 1, truncated: false, budget: BUDGET});
    });

    it('run_sql charges the measured cost even when the query errors', async () => {
        asMock(readonly.runReadOnlyQuery).mockRejectedValue(new Error('query blew up'));
        expect((await callTool('run_sql', {sql: 'SELECT 1'})).isError).toBe(true);
        expect(quota.chargeQueryBudget).toHaveBeenCalledWith(RESERVATION, expect.any(Number));
    });

    it('run_sql reports an exhausted budget without running or charging', async () => {
        asMock(quota.reserveQueryBudget).mockRejectedValue(new quota.QuotaExceededError('over budget'));
        expect(await callTool('run_sql', {sql: 'SELECT 1'})).toEqual({content: [{type: 'text', text: 'over budget'}], isError: true});
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
        expect(quota.chargeQueryBudget).not.toHaveBeenCalled();
    });

    it('run_sql rejects a non-string / empty sql before touching budget or the DB', async () => {
        expect(tools.get('run_sql')!.config.inputSchema.safeParse({sql: 123}).success).toBe(false);
        expect(tools.get('run_sql')!.config.inputSchema.safeParse({sql: ''}).success).toBe(false);
        expect(tools.get('run_sql')!.config.inputSchema.safeParse({sql: `SELECT ${'1'.repeat(10_000)}`}).success).toBe(false);
        expect(tools.get('run_sql')!.config.inputSchema.safeParse({sql: 'SELECT 1'}).success).toBe(true);
        expect((await callTool('run_sql', {sql: '   '})).isError).toBe(true);
        expect(quota.reserveQueryBudget).not.toHaveBeenCalled();
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('list_tables introspects information_schema without consuming budget', async () => {
        await callTool('list_tables');
        expect(lastSql()).toContain('information_schema.tables');
        expect(lastSql()).toContain("table_schema IN ('github', 'gitgazer')");
        expect(quota.reserveQueryBudget).not.toHaveBeenCalled();
        expect(quota.chargeQueryBudget).not.toHaveBeenCalled();
    });

    it('describe_table embeds a validated identifier', async () => {
        await callTool('describe_table', {table: 'workflow_runs'});
        expect(lastSql()).toContain("table_schema IN ('github', 'gitgazer')");
        expect(lastSql()).toContain("table_name = 'workflow_runs'");
    });

    it('describe_table rejects an injection attempt', () => {
        expect(tools.get('describe_table')!.config.inputSchema.safeParse({table: "x'; DROP TABLE y; --"}).success).toBe(false);
        expect(tools.get('describe_table')!.config.inputSchema.safeParse({table: 'workflow_runs'}).success).toBe(true);
    });

    it('returns a raw database error as a generic tool error', async () => {
        asMock(readonly.runReadOnlyQuery).mockRejectedValue(new Error('relation "secret_table" does not exist at character 15'));
        expect(await callTool('run_sql', {sql: 'SELECT 1'})).toEqual({content: [{type: 'text', text: 'Tool execution failed'}], isError: true});
    });

    it('does not echo a failure to sign the tenant context, even one caused by a permission error', async () => {
        const {DrizzleQueryError} = await import('drizzle-orm/errors');
        const denied = new DrizzleQueryError(
            'SELECT gitgazer.sign_context($1, $2::integer, $3::bigint) AS signature',
            [`${ID_A}:viewer`, 4242, '1793000000123456'],
            Object.assign(new Error('permission denied for function sign_context'), {code: '42501'}),
        );
        // Stands in for McpContextError, which the mocked queries module does not export.
        const signingFailure = Object.assign(new Error('Could not sign the MCP tenant context'), {cause: denied});
        asMock(readonly.runReadOnlyQuery).mockRejectedValue(signingFailure);

        expect(await callTool('run_sql', {sql: 'SELECT 1'})).toEqual({content: [{type: 'text', text: 'Tool execution failed'}], isError: true});
    });

    it('does not echo a raw permission error, which carries the full query', async () => {
        const {DrizzleQueryError} = await import('drizzle-orm/errors');
        const denied = new DrizzleQueryError(
            'WITH _mcp AS (SELECT * FROM (SELECT * FROM gitgazer.users) AS _mcp_inner LIMIT $1) SELECT * FROM _mcp',
            [101],
            Object.assign(new Error('permission denied for table users'), {code: '42501'}),
        );
        asMock(readonly.runReadOnlyQuery).mockRejectedValue(denied);

        expect(await callTool('run_sql', {sql: 'SELECT * FROM gitgazer.users'})).toEqual({
            content: [{type: 'text', text: 'Tool execution failed'}],
            isError: true,
        });
    });

    it('echoes a ReadOnlyQueryError message', async () => {
        asMock(readonly.runReadOnlyQuery).mockRejectedValue(new readonly.ReadOnlyQueryError('Only read-only SELECT/WITH queries are allowed'));
        expect(await callTool('run_sql', {sql: 'DELETE FROM x'})).toMatchObject({
            isError: true,
            content: [{text: 'Only read-only SELECT/WITH queries are allowed'}],
        });
    });

    it('rejects an unknown tool', async () => {
        const {createMcpServer} = await import('@/domains/mcp/mcp.server');
        const {WebStandardStreamableHTTPServerTransport} = await import('@modelcontextprotocol/server');
        const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
        await createMcpServer().connect(transport);
        const request = new Request('https://app.example.com/api/mcp', {
            method: 'POST',
            headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'},
            body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'list_integrations', arguments: {}}}),
        });
        expect((await (await transport.handleRequest(request)).json()).error).toEqual({code: -32602, message: 'Tool list_integrations not found'});
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
    });
});
