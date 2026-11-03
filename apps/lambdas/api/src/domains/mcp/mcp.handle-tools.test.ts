import {NotFoundError} from '@/shared/errors';
import type {CallToolResult, McpServer} from '@modelcontextprotocol/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/domains/apps/apps.controller', () => ({
    createHandle: vi.fn(),
    updateHandle: vi.fn(),
    deleteHandle: vi.fn(),
    listSlackChannels: vi.fn(),
}));
vi.mock('@gitgazer/db/queries', () => ({runReadOnlyQuery: vi.fn(), ReadOnlyQueryError: class ReadOnlyQueryError extends Error {}}));
vi.mock('@/domains/mcp/mcp.quota', () => ({
    reserveQueryBudget: vi.fn(),
    chargeQueryBudget: vi.fn(),
    QuotaExceededError: class QuotaExceededError extends Error {},
}));
vi.mock('@/domains/integrations/integrations.controller', () => ({getUserIntegrationRoles: vi.fn()}));
vi.mock('@/shared/middleware/token-verifier', () => ({getMcpAccessVerifier: () => ({verify: vi.fn()})}));
vi.mock('@/shared/permissions/check-access', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/shared/permissions/check-access')>()),
    checkAccess: vi.fn(),
}));
vi.mock('@gitgazer/db/client', () => ({db: {select: vi.fn()}}));
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn()}}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const INTEGRATION = '11111111-1111-4111-8111-111111111111';
const APP = '22222222-2222-4222-8222-222222222222';
const HANDLE = '33333333-3333-4333-8333-333333333333';
const ROLES = {[INTEGRATION]: 'admin' as const};
const URL = 'https://hooks.slack.com/services/T/B/x';

type RegisteredTool = {
    config: {annotations: Record<string, boolean>};
    cb: (args: Record<string, unknown>, ctx: unknown) => Promise<CallToolResult>;
};

let controller: typeof import('@/domains/apps/apps.controller');
let tools: Map<string, RegisteredTool>;

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;
const callTool = (name: string, args: Record<string, unknown>): Promise<CallToolResult> =>
    tools.get(name)!.cb(args, {http: {authInfo: {token: 't', clientId: 'c', scopes: [], extra: {userId: 42}}}});
const textOf = (result: CallToolResult): string => (result.content[0] as {text: string}).text;

describe('mcp handle tools', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        controller = await import('@/domains/apps/apps.controller');
        const access = await import('@/shared/permissions/check-access');
        const integrations = await import('@/domains/integrations/integrations.controller');
        const {registerHandleTools, registerSlackChannelTool} = await import('@/domains/mcp/mcp.handle-tools');
        tools = new Map();
        const server = {registerTool: (name: string, config: RegisteredTool['config'], cb: RegisteredTool['cb']) => tools.set(name, {config, cb})};
        registerHandleTools(server as unknown as McpServer);
        registerSlackChannelTool(server as unknown as McpServer);

        asMock(access.checkAccess).mockReturnValue({allowed: true});
        asMock(integrations.getUserIntegrationRoles).mockResolvedValue(ROLES);
    });

    it('create_notification_handle creates a Slack handle from a channel id', async () => {
        asMock(controller.createHandle).mockResolvedValue({handleId: HANDLE});
        const res = await callTool('create_notification_handle', {integration_id: INTEGRATION, app_id: APP, channel_id: 'C1'});
        expect(controller.createHandle).toHaveBeenCalledWith({
            integrationId: INTEGRATION,
            integrationIds: [INTEGRATION],
            appId: APP,
            channelId: 'C1',
            source: 'mcp',
        });
        expect(JSON.parse(textOf(res))).toEqual({handleId: HANDLE});
    });

    it('create_notification_handle creates a webhook handle from name and url', async () => {
        asMock(controller.createHandle).mockResolvedValue({handleId: HANDLE});
        await callTool('create_notification_handle', {integration_id: INTEGRATION, app_id: APP, name: 'Ops', url: URL});
        expect(controller.createHandle).toHaveBeenCalledWith({
            integrationId: INTEGRATION,
            integrationIds: [INTEGRATION],
            appId: APP,
            name: 'Ops',
            url: URL,
            source: 'mcp',
        });
    });

    it.each([
        {case: 'channel_id with name and url', args: {channel_id: 'C1', name: 'Ops', url: URL}},
        {case: 'neither channel_id nor name and url', args: {}},
        {case: 'name without url', args: {name: 'Ops'}},
    ])('create_notification_handle rejects $case', async ({args}) => {
        const res = await callTool('create_notification_handle', {integration_id: INTEGRATION, app_id: APP, ...args});
        expect(res.isError).toBe(true);
        expect(controller.createHandle).not.toHaveBeenCalled();
    });

    it('update_notification_handle passes the given fields with source mcp', async () => {
        asMock(controller.updateHandle).mockResolvedValue({handleId: HANDLE});
        await callTool('update_notification_handle', {integration_id: INTEGRATION, handle_id: HANDLE, name: 'New'});
        expect(asMock(controller.updateHandle).mock.calls[0][0]).toEqual({
            integrationId: INTEGRATION,
            integrationIds: [INTEGRATION],
            handleId: HANDLE,
            name: 'New',
            source: 'mcp',
        });
    });

    it('delete_notification_handle deletes with source mcp', async () => {
        asMock(controller.deleteHandle).mockResolvedValue(undefined);
        const res = await callTool('delete_notification_handle', {integration_id: INTEGRATION, handle_id: HANDLE});
        expect(controller.deleteHandle).toHaveBeenCalledWith({
            integrationId: INTEGRATION,
            integrationIds: [INTEGRATION],
            handleId: HANDLE,
            source: 'mcp',
        });
        expect(JSON.parse(textOf(res))).toEqual({deleted: true, handle_id: HANDLE});
    });

    it('delete_notification_handle reports not found', async () => {
        asMock(controller.deleteHandle).mockRejectedValue(new NotFoundError('Handle not found'));
        const res = await callTool('delete_notification_handle', {integration_id: INTEGRATION, handle_id: HANDLE});
        expect(res.isError).toBe(true);
        expect(textOf(res)).toBe('Handle not found');
    });

    it('list_slack_channels lists the channels of the app', async () => {
        asMock(controller.listSlackChannels).mockResolvedValue([{id: 'C1', name: 'general'}]);
        const res = await callTool('list_slack_channels', {integration_id: INTEGRATION, app_id: APP});
        expect(controller.listSlackChannels).toHaveBeenCalledWith({integrationId: INTEGRATION, integrationIds: [INTEGRATION], appId: APP});
        expect(JSON.parse(textOf(res))).toEqual([{id: 'C1', name: 'general'}]);
    });

    it('sets the annotations', () => {
        expect(tools.get('delete_notification_handle')!.config.annotations).toEqual({readOnlyHint: false, destructiveHint: true});
        expect(tools.get('create_notification_handle')!.config.annotations).toEqual({readOnlyHint: false});
        expect(tools.get('list_slack_channels')!.config.annotations.readOnlyHint).toBe(true);
    });
});
