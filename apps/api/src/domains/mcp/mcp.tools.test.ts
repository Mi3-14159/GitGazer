import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/queries', () => ({runReadOnlyQuery: vi.fn()}));
vi.mock('@/domains/mcp/mcp.quota', () => ({
    enforceQuota: vi.fn(),
    QuotaExceededError: class QuotaExceededError extends Error {},
}));

const IDS = ['11111111-1111-1111-1111-111111111111'];
const CALLER = {userId: 42, integrationIds: IDS};
const BUDGET = {limit: 100, remaining: 99, resetAt: '2026-07-21T01:00:00.000Z'};

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
        asMock(quota.enforceQuota).mockResolvedValue(BUDGET);
    });

    const lastSql = (): string => asMock(readonly.runReadOnlyQuery).mock.calls[0][0].sql;

    it('advertises exactly the read-only tools', () => {
        expect(mod.MCP_TOOLS.map((t) => t.name)).toEqual(['run_sql', 'list_tables', 'describe_table', 'list_integrations']);
    });

    it('run_sql enforces quota, runs the query, and returns the remaining budget', async () => {
        const res = await mod.runToolCall('run_sql', {sql: 'SELECT 1 AS x'}, CALLER);
        expect(quota.enforceQuota).toHaveBeenCalledWith(42);
        expect(readonly.runReadOnlyQuery).toHaveBeenCalledWith({sql: 'SELECT 1 AS x', integrationIds: IDS});
        expect(JSON.parse(res.content[0].text)).toEqual({columns: ['x'], rows: [{x: 1}], rowCount: 1, truncated: false, budget: BUDGET});
    });

    it('run_sql rejects when the quota is exhausted, without running the query', async () => {
        asMock(quota.enforceQuota).mockRejectedValue(new quota.QuotaExceededError('over budget'));
        await expect(mod.runToolCall('run_sql', {sql: 'SELECT 1'}, CALLER)).rejects.toThrow(mod.McpToolError);
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('run_sql rejects a non-string / empty sql before touching quota or the DB', async () => {
        await expect(mod.runToolCall('run_sql', {sql: 123}, CALLER)).rejects.toThrow(mod.McpToolError);
        await expect(mod.runToolCall('run_sql', {sql: '   '}, CALLER)).rejects.toThrow(mod.McpToolError);
        expect(quota.enforceQuota).not.toHaveBeenCalled();
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('list_tables introspects information_schema without consuming quota', async () => {
        await mod.runToolCall('list_tables', {}, CALLER);
        expect(lastSql()).toContain('information_schema.tables');
        expect(quota.enforceQuota).not.toHaveBeenCalled();
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
