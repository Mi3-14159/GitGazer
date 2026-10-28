import {OAuthErrorCode} from '@modelcontextprotocol/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {verify, usersLookup} = vi.hoisted(() => ({verify: vi.fn(), usersLookup: vi.fn()}));

vi.mock('@/shared/middleware/token-verifier', () => ({
    getMcpAccessVerifier: () => ({verify}),
}));
vi.mock('@/domains/integrations/integrations.controller', () => ({getUserIntegrationRoles: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({db: {select: () => ({from: () => ({where: () => ({limit: usersLookup})})})}}));
vi.mock('@gitgazer/backend-core/config', () => ({
    default: {get: vi.fn((key: string) => (key === 'mcpServerUrl' ? 'https://app.gitgazer.com/api/mcp' : {userPoolId: 'eu-central-1_ABC123'}))},
}));

let ctrl: typeof import('@/domains/mcp/mcp.controller');

describe('mcpTokenVerifier', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        verify.mockReset();
        usersLookup.mockReset();
        ctrl = await import('@/domains/mcp/mcp.controller');
    });

    it('returns AuthInfo with expiry, client id and the GitGazer user id', async () => {
        verify.mockResolvedValue({sub: 'cognito-sub', client_id: 'mcp-client', exp: 1_900_000_000, scope: 'openid email'});
        usersLookup.mockResolvedValue([{id: 7}]);
        await expect(ctrl.mcpTokenVerifier.verifyAccessToken('tok')).resolves.toEqual({
            token: 'tok',
            clientId: 'mcp-client',
            scopes: ['openid', 'email'],
            expiresAt: 1_900_000_000,
            extra: {userId: 7},
        });
    });
    it('rejects an invalid or expired token as invalid_token', async () => {
        verify.mockRejectedValue(new Error('expired'));
        await expect(ctrl.mcpTokenVerifier.verifyAccessToken('tok')).rejects.toMatchObject({code: OAuthErrorCode.InvalidToken});
    });
    it('rejects a token for a user that has never signed in as invalid_token', async () => {
        verify.mockResolvedValue({sub: 'cognito-sub', client_id: 'c', exp: 1_900_000_000});
        usersLookup.mockResolvedValue([]);
        await expect(ctrl.mcpTokenVerifier.verifyAccessToken('tok')).rejects.toMatchObject({code: OAuthErrorCode.InvalidToken});
    });
});

describe('mcpUserId', () => {
    beforeEach(async () => {
        ctrl = await import('@/domains/mcp/mcp.controller');
    });

    it('reads the user id from AuthInfo.extra', () => expect(ctrl.mcpUserId({token: 't', clientId: 'c', scopes: [], extra: {userId: 7}})).toBe(7));
    it('throws when AuthInfo carries no user id', () => expect(() => ctrl.mcpUserId(undefined)).toThrow());
});

describe('buildProtectedResourceMetadata', () => {
    beforeEach(async () => {
        ctrl = await import('@/domains/mcp/mcp.controller');
    });

    it('advertises the configured mcp resource, our authorization-server origin, and bearer/scope hints', () => {
        const meta = ctrl.buildProtectedResourceMetadata('https://api.example.com');
        expect(meta).toEqual({
            resource: 'https://app.gitgazer.com/api/mcp',
            authorization_servers: ['https://app.gitgazer.com'],
            bearer_methods_supported: ['header'],
            scopes_supported: ['openid', 'email', 'profile'],
        });
    });
});
