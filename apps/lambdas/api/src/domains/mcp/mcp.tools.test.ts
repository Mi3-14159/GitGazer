import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/queries', () => ({runReadOnlyQuery: vi.fn()}));
vi.mock('@/domains/mcp/mcp.quota', () => ({
    reserveQueryBudget: vi.fn(),
    chargeQueryBudget: vi.fn(),
    QuotaExceededError: class QuotaExceededError extends Error {},
}));

const IDS = ['11111111-1111-1111-1111-111111111111'];
const CALLER = {userId: 42, integrationIds: IDS};
const RESERVATION = {
    userId: 42,
    budgetMs: 600_000,
    windowSeconds: 3600,
    maxQuerySeconds: 60,
};
const BUDGET = {limit: 600, consumed: 1.5, remaining: 598.5, resetAt: '2026-07-21T01:00:00.000Z'};

let readonly: typeof import('@gitgazer/db/queries');
let quota: typeof import('@/domains/mcp/mcp.quota');
let mod: typeof import('@/domains/mcp/mcp.tools');

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

describe('mcp tools', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        readonly = await import('@gitgazer/db/queries');
        quota = await import('@/domains/mcp/mcp.quota');
        mod = await import('@/domains/mcp/mcp.tools');
        asMock(readonly.runReadOnlyQuery).mockResolvedValue({columns: ['x'], rows: [{x: 1}], rowCount: 1, truncated: false});
        asMock(quota.reserveQueryBudget).mockResolvedValue(RESERVATION);
        asMock(quota.chargeQueryBudget).mockResolvedValue(BUDGET);
    });

    const lastSql = (): string => asMock(readonly.runReadOnlyQuery).mock.calls[0][0].sql;

    it('advertises exactly the read-only tools', () => {
        expect(mod.MCP_TOOLS.map((t) => t.name)).toEqual(['run_sql', 'list_tables', 'describe_table', 'list_integrations']);
    });

    it('run_sql reserves budget, runs with the max-query timeout, charges, and returns the budget', async () => {
        const res = await mod.runToolCall('run_sql', {sql: 'SELECT 1 AS x'}, CALLER);
        expect(quota.reserveQueryBudget).toHaveBeenCalledWith(42);
        expect(readonly.runReadOnlyQuery).toHaveBeenCalledWith({sql: 'SELECT 1 AS x', integrationIds: IDS, statementTimeoutS: 60});
        expect(quota.chargeQueryBudget).toHaveBeenCalledWith(RESERVATION, expect.any(Number));
        expect(JSON.parse(res.content[0].text)).toEqual({columns: ['x'], rows: [{x: 1}], rowCount: 1, truncated: false, budget: BUDGET});
    });

    it('run_sql charges the measured cost even when the query errors, then rethrows', async () => {
        const boom = new Error('query blew up');
        asMock(readonly.runReadOnlyQuery).mockRejectedValue(boom);
        await expect(mod.runToolCall('run_sql', {sql: 'SELECT 1'}, CALLER)).rejects.toBe(boom);
        expect(quota.chargeQueryBudget).toHaveBeenCalledWith(RESERVATION, expect.any(Number));
    });

    it('run_sql rejects when the budget is exhausted, without running or charging', async () => {
        asMock(quota.reserveQueryBudget).mockRejectedValue(new quota.QuotaExceededError('over budget'));
        await expect(mod.runToolCall('run_sql', {sql: 'SELECT 1'}, CALLER)).rejects.toThrow(mod.McpToolError);
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
        expect(quota.chargeQueryBudget).not.toHaveBeenCalled();
    });

    it('run_sql rejects a non-string / empty sql before touching budget or the DB', async () => {
        await expect(mod.runToolCall('run_sql', {sql: 123}, CALLER)).rejects.toThrow(mod.McpToolError);
        await expect(mod.runToolCall('run_sql', {sql: '   '}, CALLER)).rejects.toThrow(mod.McpToolError);
        expect(quota.reserveQueryBudget).not.toHaveBeenCalled();
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('list_tables introspects information_schema without consuming budget', async () => {
        await mod.runToolCall('list_tables', {}, CALLER);
        expect(lastSql()).toContain('information_schema.tables');
        expect(quota.reserveQueryBudget).not.toHaveBeenCalled();
        expect(quota.chargeQueryBudget).not.toHaveBeenCalled();
    });

    it('describe_table embeds a validated identifier', async () => {
        await mod.runToolCall('describe_table', {table: 'workflow_runs'}, CALLER);
        expect(lastSql()).toContain("table_name = 'workflow_runs'");
    });

    it('describe_table rejects an injection attempt', async () => {
        await expect(mod.runToolCall('describe_table', {table: "x'; DROP TABLE y; --"}, CALLER)).rejects.toThrow(mod.McpToolError);
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('list_integrations reads github.integrations (tenant-scoped by RLS)', async () => {
        await mod.runToolCall('list_integrations', {}, CALLER);
        expect(lastSql()).toContain('github.integrations');
    });

    it('rejects an unknown tool', async () => {
        await expect(mod.runToolCall('drop_everything', {}, CALLER)).rejects.toThrow(/Unknown tool/);
    });
});
