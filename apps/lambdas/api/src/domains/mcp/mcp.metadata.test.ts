import router from '@/domains/mcp/mcp.routes';
import {createHonoApp} from '@/shared/hono/app';
import {describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => undefined)}}));
vi.mock('@/shared/middleware/token-verifier', () => ({getMcpAccessVerifier: () => ({verify: vi.fn()})}));
vi.mock('@/domains/integrations/integrations.controller', () => ({getUserIntegrationRoles: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({db: {select: vi.fn()}}));

// Captured from the Powertools implementation before the move to Hono.
const PROTECTED_RESOURCE_METADATA = {
    resource: 'https://app.gitgazer.com/api/mcp',
    authorization_servers: ['https://app.gitgazer.com'],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'email', 'profile'],
};

const AUTHORIZATION_SERVER_METADATA = {
    issuer: 'https://app.gitgazer.com',
    authorization_endpoint: 'https://app.gitgazer.com/api/mcp/oauth/authorize',
    token_endpoint: 'https://app.gitgazer.com/api/mcp/oauth/token',
    registration_endpoint: 'https://app.gitgazer.com/api/mcp/oauth/register',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
    scopes_supported: ['openid', 'email', 'profile'],
};

// With no configured mcpServerUrl the origin comes from the API Gateway domain of the request, which testRequest cannot set.
const getFromDomain = (path: string, domainName: string) =>
    createHonoApp()
        .route('/', router)
        .request(path, {headers: {host: 'ignored.example.com'}}, {event: {requestContext: {domainName}} as never});

describe('MCP metadata documents', () => {
    it('keeps the MCP metadata documents unchanged', async () => {
        const resource = await getFromDomain('/.well-known/oauth-protected-resource', 'app.gitgazer.com');
        const authServer = await getFromDomain('/.well-known/oauth-authorization-server', 'app.gitgazer.com');

        expect(resource.status).toBe(200);
        expect(await resource.json()).toEqual(PROTECTED_RESOURCE_METADATA);
        expect(authServer.status).toBe(200);
        expect(await authServer.json()).toEqual(AUTHORIZATION_SERVER_METADATA);
    });
});
