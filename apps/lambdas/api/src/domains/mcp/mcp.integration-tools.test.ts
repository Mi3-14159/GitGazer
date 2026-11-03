import {NotFoundError} from '@/shared/errors';
import type {CallToolResult, McpServer} from '@modelcontextprotocol/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/domains/integrations/integrations.controller', () => ({
    getUserIntegrationRoles: vi.fn(),
    upsertIntegration: vi.fn(),
    updateWebhookEvents: vi.fn(),
}));
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({toggleEventLogRead: vi.fn(), markAllEventLogRead: vi.fn()}));
vi.mock('@gitgazer/db/queries', () => ({runReadOnlyQuery: vi.fn(), ReadOnlyQueryError: class ReadOnlyQueryError extends Error {}}));
vi.mock('@/domains/mcp/mcp.quota', () => ({
    reserveQueryBudget: vi.fn(),
    chargeQueryBudget: vi.fn(),
    QuotaExceededError: class QuotaExceededError extends Error {},
}));
vi.mock('@/shared/middleware/token-verifier', () => ({getMcpAccessVerifier: () => ({verify: vi.fn()})}));
vi.mock('@/shared/permissions/check-access', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/shared/permissions/check-access')>()),
    checkAccess: vi.fn(),
}));
vi.mock('@gitgazer/db/client', () => ({db: {select: vi.fn()}}));
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn()}}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ENTRY = '33333333-3333-4333-8333-333333333333';
const ROLES = {[A]: 'admin' as const, [B]: 'member' as const};

type RegisteredTool = {
    config: {annotations: Record<string, boolean>; inputSchema: {safeParse: (input: unknown) => {success: boolean; data?: unknown}}};
    cb: (args: Record<string, unknown>, ctx: unknown) => Promise<CallToolResult>;
};

let integrations: typeof import('@/domains/integrations/integrations.controller');
let eventLog: typeof import('@gitgazer/backend-services/event-log.controller');
let tools: Map<string, RegisteredTool>;

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;
const callTool = (name: string, args: Record<string, unknown>): Promise<CallToolResult> =>
    tools.get(name)!.cb(args, {http: {authInfo: {token: 't', clientId: 'c', scopes: [], extra: {userId: 42}}}});
const textOf = (result: CallToolResult): string => (result.content[0] as {text: string}).text;

describe('mcp integration tools', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        integrations = await import('@/domains/integrations/integrations.controller');
        eventLog = await import('@gitgazer/backend-services/event-log.controller');
        const access = await import('@/shared/permissions/check-access');
        const {registerIntegrationTools} = await import('@/domains/mcp/mcp.integration-tools');
        tools = new Map();
        const server = {registerTool: (name: string, config: RegisteredTool['config'], cb: RegisteredTool['cb']) => tools.set(name, {config, cb})};
        registerIntegrationTools(server as unknown as McpServer);

        asMock(access.checkAccess).mockReturnValue({allowed: true});
        asMock(integrations.getUserIntegrationRoles).mockResolvedValue(ROLES);
    });

    it('rename_integration upserts with the label and source mcp', async () => {
        asMock(integrations.upsertIntegration).mockResolvedValue({id: A, label: 'New'});
        const res = await callTool('rename_integration', {integration_id: A, label: 'New'});
        expect(integrations.upsertIntegration).toHaveBeenCalledWith({id: A, label: 'New', integrationIds: [A], source: 'mcp'});
        expect(JSON.parse(textOf(res))).toEqual({id: A, label: 'New'});
    });

    it('rename_integration trims the label and rejects an empty one', () => {
        const schema = tools.get('rename_integration')!.config.inputSchema;
        expect(schema.safeParse({integration_id: A, label: ' New '}).data).toEqual({integration_id: A, label: 'New'});
        expect(schema.safeParse({integration_id: A, label: '  '}).success).toBe(false);
    });

    it('rename_integration rejects a label longer than the column', () => {
        const schema = tools.get('rename_integration')!.config.inputSchema;
        expect(schema.safeParse({integration_id: A, label: 'a'.repeat(255)}).success).toBe(true);
        expect(schema.safeParse({integration_id: A, label: 'a'.repeat(256)}).success).toBe(false);
    });

    it('update_webhook_events passes the installation and events with source mcp', async () => {
        asMock(integrations.updateWebhookEvents).mockResolvedValue({events: ['workflow_run']});
        const res = await callTool('update_webhook_events', {integration_id: A, installation_id: 7, events: ['workflow_run']});
        expect(integrations.updateWebhookEvents).toHaveBeenCalledWith({integrationId: A, installationId: 7, events: ['workflow_run'], source: 'mcp'});
        expect(JSON.parse(textOf(res))).toEqual({events: ['workflow_run']});
    });

    it('update_webhook_events rejects an unknown event', () => {
        const schema = tools.get('update_webhook_events')!.config.inputSchema;
        expect(schema.safeParse({integration_id: A, installation_id: 7, events: ['workflow_run']}).success).toBe(true);
        expect(schema.safeParse({integration_id: A, installation_id: 7, events: ['push']}).success).toBe(false);
    });

    it('update_webhook_events rejects an empty event list', () => {
        const schema = tools.get('update_webhook_events')!.config.inputSchema;
        expect(schema.safeParse({integration_id: A, installation_id: 7, events: []}).success).toBe(false);
    });

    it('update_webhook_events reports an unknown installation in-band', async () => {
        asMock(integrations.updateWebhookEvents).mockRejectedValue(new NotFoundError('Installation not found'));
        const res = await callTool('update_webhook_events', {integration_id: A, installation_id: 7, events: ['workflow_run']});
        expect(res.isError).toBe(true);
        expect(textOf(res)).toBe('Installation not found');
    });

    it('set_event_log_read scopes to all the caller integrations', async () => {
        asMock(eventLog.toggleEventLogRead).mockResolvedValue({id: ENTRY, read: true});
        const res = await callTool('set_event_log_read', {id: ENTRY, read: true});
        expect(eventLog.toggleEventLogRead).toHaveBeenCalledWith({id: ENTRY, integrationIds: [A, B], read: true});
        expect(JSON.parse(textOf(res))).toEqual({id: ENTRY, read: true});
    });

    it('set_event_log_read reports a missing entry', async () => {
        asMock(eventLog.toggleEventLogRead).mockResolvedValue(null);
        const res = await callTool('set_event_log_read', {id: ENTRY, read: false});
        expect(res.isError).toBe(true);
        expect(textOf(res)).toBe('Event log entry not found');
    });

    it('mark_all_event_log_read returns the updated count', async () => {
        asMock(eventLog.markAllEventLogRead).mockResolvedValue(3);
        const res = await callTool('mark_all_event_log_read', {});
        expect(eventLog.markAllEventLogRead).toHaveBeenCalledWith({integrationIds: [A, B]});
        expect(JSON.parse(textOf(res))).toEqual({updated: 3});
    });

    it('marks every tool as a write tool', () => {
        for (const name of ['rename_integration', 'update_webhook_events', 'set_event_log_read', 'mark_all_event_log_read']) {
            expect(tools.get(name)!.config.annotations).toEqual({readOnlyHint: false});
        }
    });
});
