import {beforeEach, describe, expect, it, vi} from 'vitest';

const {verify} = vi.hoisted(() => ({verify: vi.fn()}));

vi.mock('@/shared/middleware/token-verifier', () => ({
    getMcpAccessVerifier: () => ({verify}),
}));
vi.mock('@/domains/integrations/integrations.controller', () => ({getUserIntegrationRoles: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({db: {select: vi.fn()}}));
vi.mock('@/shared/config', () => ({
    default: {get: vi.fn((key: string) => (key === 'mcpServerUrl' ? 'https://app.gitgazer.com/api/mcp' : {userPoolId: 'eu-central-1_ABC123'}))},
}));

let ctrl: typeof import('@/domains/mcp/mcp.controller');
let integrations: typeof import('@/domains/integrations/integrations.controller');
let rds: typeof import('@gitgazer/db/client');

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

const mockUserRows = (rows: {id: number}[]): void => {
    asMock(rds.db.select).mockReturnValue({from: () => ({where: () => ({limit: () => Promise.resolve(rows)})})});
};

describe('resolveMcpCaller', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        verify.mockReset();
        ctrl = await import('@/domains/mcp/mcp.controller');
        integrations = await import('@/domains/integrations/integrations.controller');
        rds = await import('@gitgazer/db/client');
    });

    it('resolves the user id + integrations from a valid bearer token', async () => {
        verify.mockResolvedValue({sub: 'cognito-sub'});
        mockUserRows([{id: 7}]);
        asMock(integrations.getUserIntegrationRoles).mockResolvedValue({i1: 'admin', i2: 'viewer'});

        await expect(ctrl.resolveMcpCaller('Bearer abc.def.ghi')).resolves.toEqual({userId: 7, integrationIds: ['i1', 'i2']});
    });

    it('rejects a missing Authorization header', async () => {
        await expect(ctrl.resolveMcpCaller(undefined)).rejects.toThrow(ctrl.McpAuthError);
    });

    it('rejects a non-Bearer header', async () => {
        await expect(ctrl.resolveMcpCaller('token abc')).rejects.toThrow(/Malformed/);
    });

    it('rejects an invalid or expired token', async () => {
        verify.mockRejectedValue(new Error('expired'));
        await expect(ctrl.resolveMcpCaller('Bearer bad')).rejects.toThrow(/Invalid or expired/);
    });

    it('rejects a token for a user that has never signed in', async () => {
        verify.mockResolvedValue({sub: 'nope'});
        mockUserRows([]);
        await expect(ctrl.resolveMcpCaller('Bearer abc')).rejects.toThrow(/Unknown user/);
    });
});

describe('buildProtectedResourceMetadata', () => {
    beforeEach(async () => {
        ctrl = await import('@/domains/mcp/mcp.controller');
    });

    it('advertises the configured mcp resource, our authorization-server origin, and bearer/scope hints', () => {
        const meta = ctrl.buildProtectedResourceMetadata({requestContext: {domainName: 'api.example.com'}} as never);
        expect(meta).toEqual({
            resource: 'https://app.gitgazer.com/api/mcp',
            authorization_servers: ['https://app.gitgazer.com'],
            bearer_methods_supported: ['header'],
            scopes_supported: ['openid', 'email', 'profile'],
        });
    });
});
