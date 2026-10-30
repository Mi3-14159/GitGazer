import {BadRequestError} from '@/shared/errors';
import type {CallToolResult, McpServer} from '@modelcontextprotocol/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/domains/notifications/notifications.controller', () => ({
    upsertNotificationRule: vi.fn(),
    updateNotificationRule: vi.fn(),
    deleteNotificationRule: vi.fn(),
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
const RULE = '22222222-2222-4222-8222-222222222222';
const HANDLE = '33333333-3333-4333-8333-333333333333';
const ROLES = {[INTEGRATION]: 'member' as const};

type RegisteredTool = {
    config: {inputSchema: {safeParse: (input: unknown) => {success: boolean}}};
    cb: (args: Record<string, unknown>, ctx: unknown) => Promise<CallToolResult>;
};

let controller: typeof import('@/domains/notifications/notifications.controller');
let access: typeof import('@/shared/permissions/check-access');
let tools: Map<string, RegisteredTool>;

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;
const callTool = (name: string, args: Record<string, unknown>): Promise<CallToolResult> =>
    tools.get(name)!.cb(args, {http: {authInfo: {token: 't', clientId: 'c', scopes: [], extra: {userId: 42}}}});
const textOf = (result: CallToolResult): string => (result.content[0] as {text: string}).text;

describe('mcp notification rule tools', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        controller = await import('@/domains/notifications/notifications.controller');
        access = await import('@/shared/permissions/check-access');
        const integrations = await import('@/domains/integrations/integrations.controller');
        const {registerNotificationRuleTools} = await import('@/domains/mcp/mcp.notification-tools');
        tools = new Map();
        const server = {registerTool: (name: string, config: RegisteredTool['config'], cb: RegisteredTool['cb']) => tools.set(name, {config, cb})};
        registerNotificationRuleTools(server as unknown as McpServer);

        asMock(access.checkAccess).mockReturnValue({allowed: true});
        asMock(integrations.getUserIntegrationRoles).mockResolvedValue(ROLES);
    });

    it('create_notification_rule calls upsert with createOnly and source mcp', async () => {
        const saved = {id: RULE, label: 'CI'};
        asMock(controller.upsertNotificationRule).mockResolvedValue(saved);

        const res = await callTool('create_notification_rule', {
            integration_id: INTEGRATION,
            label: 'CI',
            handle_ids: [HANDLE],
            enabled: true,
            ignore_dependabot: false,
            rule: {owner: 'o'},
        });

        expect(controller.upsertNotificationRule).toHaveBeenCalledWith({
            rule: {label: 'CI', handleIds: [HANDLE], enabled: true, ignore_dependabot: false, rule: {owner: 'o'}},
            integrationId: INTEGRATION,
            createOnly: true,
            source: 'mcp',
        });
        expect(JSON.parse(textOf(res))).toEqual(saved);
    });

    it('update_notification_rule passes only the given fields', async () => {
        asMock(controller.updateNotificationRule).mockResolvedValue({id: RULE});
        await callTool('update_notification_rule', {integration_id: INTEGRATION, rule_id: RULE, enabled: false});
        expect(controller.updateNotificationRule).toHaveBeenCalledWith({
            integrationId: INTEGRATION,
            ruleId: RULE,
            changes: {enabled: false},
            source: 'mcp',
        });
    });

    it('update_notification_rule maps handle_ids to handleIds', async () => {
        asMock(controller.updateNotificationRule).mockResolvedValue({id: RULE});
        await callTool('update_notification_rule', {integration_id: INTEGRATION, rule_id: RULE, handle_ids: [HANDLE]});
        expect(asMock(controller.updateNotificationRule).mock.calls[0][0].changes).toEqual({handleIds: [HANDLE]});
    });

    it('delete_notification_rule deletes with source mcp', async () => {
        asMock(controller.deleteNotificationRule).mockResolvedValue(true);
        const res = await callTool('delete_notification_rule', {integration_id: INTEGRATION, rule_id: RULE});
        expect(controller.deleteNotificationRule).toHaveBeenCalledWith(RULE, INTEGRATION, 'mcp');
        expect(JSON.parse(textOf(res))).toEqual({deleted: true, rule_id: RULE});
    });

    it('delete_notification_rule reports not found', async () => {
        asMock(controller.deleteNotificationRule).mockResolvedValue(false);
        const res = await callTool('delete_notification_rule', {integration_id: INTEGRATION, rule_id: RULE});
        expect(res.isError).toBe(true);
        expect(textOf(res)).toBe('Notification rule not found');
    });

    it('checks the tool operation with the integration id', async () => {
        asMock(controller.deleteNotificationRule).mockResolvedValue(true);
        await callTool('delete_notification_rule', {integration_id: INTEGRATION, rule_id: RULE});
        expect(access.checkAccess).toHaveBeenCalledWith({userId: 42, integrationRoles: ROLES}, 'notificationRule.delete', INTEGRATION);
    });

    it('refuses a denied caller without calling the controller', async () => {
        asMock(access.checkAccess).mockReturnValue({allowed: false, reason: 'insufficient role'});
        const res = await callTool('delete_notification_rule', {integration_id: INTEGRATION, rule_id: RULE});
        expect(res).toEqual({content: [{type: 'text', text: 'Insufficient permissions'}], isError: true});
        expect(controller.deleteNotificationRule).not.toHaveBeenCalled();
    });

    it('returns 4xx error messages and hides other errors', async () => {
        const args = {integration_id: INTEGRATION, rule_id: RULE};
        asMock(controller.deleteNotificationRule).mockRejectedValueOnce(new BadRequestError('Unknown notification handle'));
        expect(textOf(await callTool('delete_notification_rule', args))).toBe('Unknown notification handle');

        asMock(controller.deleteNotificationRule).mockRejectedValueOnce(new Error('db down'));
        const res = await callTool('delete_notification_rule', args);
        expect(res.isError).toBe(true);
        expect(textOf(res)).toBe('Tool execution failed');
    });

    it('requires integration_id on every write tool', () => {
        const body = {rule_id: RULE, label: 'CI', handle_ids: [HANDLE], enabled: true, ignore_dependabot: false, rule: {}};
        for (const name of ['create_notification_rule', 'update_notification_rule', 'delete_notification_rule']) {
            expect(tools.get(name)!.config.inputSchema.safeParse(body).success).toBe(false);
            expect(tools.get(name)!.config.inputSchema.safeParse({...body, integration_id: INTEGRATION}).success).toBe(true);
        }
    });

    it('bounds the label and the handle ids on create', () => {
        const body = {integration_id: INTEGRATION, label: 'CI', handle_ids: [HANDLE], enabled: true, ignore_dependabot: false, rule: {}};
        const schema = tools.get('create_notification_rule')!.config.inputSchema;
        expect(schema.safeParse({...body, label: 'x'.repeat(101)}).success).toBe(false);
        expect(schema.safeParse({...body, handle_ids: Array(21).fill(HANDLE)}).success).toBe(false);
    });
});
