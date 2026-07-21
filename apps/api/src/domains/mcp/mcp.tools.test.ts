import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/queries/readonlyQuery', () => ({
    runReadOnlyQuery: vi.fn(),
}));

const IDS = ['11111111-1111-1111-1111-111111111111'];

let readonly: typeof import('@gitgazer/db/queries/readonlyQuery');
let mod: typeof import('@/domains/mcp/mcp.tools');

describe('mcp tools', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        readonly = await import('@gitgazer/db/queries/readonlyQuery');
        mod = await import('@/domains/mcp/mcp.tools');
        (readonly.runReadOnlyQuery as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            columns: ['x'],
            rows: [{x: 1}],
            rowCount: 1,
            truncated: false,
        });
    });

    const lastSql = (): string => (readonly.runReadOnlyQuery as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].sql;

    it('advertises exactly the read-only tools', () => {
        expect(mod.MCP_TOOLS.map((t) => t.name)).toEqual(['run_sql', 'list_tables', 'describe_table', 'list_integrations']);
    });

    it('run_sql forwards the sql + integrationIds and wraps the result as JSON text', async () => {
        const res = await mod.runToolCall('run_sql', {sql: 'SELECT 1 AS x'}, IDS);
        expect(readonly.runReadOnlyQuery).toHaveBeenCalledWith({sql: 'SELECT 1 AS x', integrationIds: IDS});
        expect(JSON.parse(res.content[0].text)).toEqual({columns: ['x'], rows: [{x: 1}], rowCount: 1, truncated: false});
    });

    it('run_sql rejects a non-string / empty sql before touching the DB', async () => {
        await expect(mod.runToolCall('run_sql', {sql: 123}, IDS)).rejects.toThrow(mod.McpToolError);
        await expect(mod.runToolCall('run_sql', {sql: '   '}, IDS)).rejects.toThrow(mod.McpToolError);
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('list_tables introspects information_schema', async () => {
        await mod.runToolCall('list_tables', {}, IDS);
        expect(lastSql()).toContain('information_schema.tables');
    });

    it('describe_table embeds a validated identifier', async () => {
        await mod.runToolCall('describe_table', {table: 'workflow_runs'}, IDS);
        expect(lastSql()).toContain("table_name = 'workflow_runs'");
    });

    it('describe_table rejects an injection attempt', async () => {
        await expect(mod.runToolCall('describe_table', {table: "x'; DROP TABLE y; --"}, IDS)).rejects.toThrow(mod.McpToolError);
        expect(readonly.runReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('list_integrations reads github.integrations (tenant-scoped by RLS)', async () => {
        await mod.runToolCall('list_integrations', {}, IDS);
        expect(lastSql()).toContain('github.integrations');
    });

    it('rejects an unknown tool', async () => {
        await expect(mod.runToolCall('drop_everything', {}, IDS)).rejects.toThrow(/Unknown tool/);
    });
});
