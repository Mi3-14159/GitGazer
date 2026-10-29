import {CognitoJwtInvalidClientIdError, JwtInvalidScopeError} from 'aws-jwt-verify/error';
import {createSign, generateKeyPairSync} from 'crypto';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const USER_POOL_ID = 'eu-central-1_ABC123';
const cognito = vi.hoisted(() => ({value: {} as Record<string, string | undefined>}));

vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => cognito.value)}}));

const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const {n, e} = publicKey.export({format: 'jwk'});
const jwk = {kty: 'RSA', n: n!, e: e!, kid: 'test-key', alg: 'RS256', use: 'sig'};

const signAccessToken = (claims: Record<string, unknown>): string => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const header = encode({alg: 'RS256', kid: 'test-key'});
    const payload = encode({
        iss: `https://cognito-idp.eu-central-1.amazonaws.com/${USER_POOL_ID}`,
        sub: 'cognito-sub',
        token_use: 'access',
        iat: now,
        exp: now + 3600,
        ...claims,
    });
    const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey).toString('base64url');
    return `${header}.${payload}.${signature}`;
};

const loadVerifier = async () => {
    vi.resetModules();
    const {getMcpAccessVerifier} = await import('@/shared/middleware/token-verifier');
    const verifier = getMcpAccessVerifier();
    verifier.cacheJwks({keys: [jwk]}, USER_POOL_ID);
    return verifier;
};

describe('getMcpAccessVerifier', () => {
    beforeEach(() => {
        cognito.value = {userPoolId: USER_POOL_ID, clientId: 'web-client', mcpClientId: 'mcp-client'};
    });

    it('accepts an MCP client token with the gitgazer-mcp/read scope', async () => {
        const verifier = await loadVerifier();
        const token = signAccessToken({client_id: 'mcp-client', scope: 'openid email profile gitgazer-mcp/read'});
        await expect(verifier.verify(token)).resolves.toMatchObject({sub: 'cognito-sub', client_id: 'mcp-client'});
    });

    it('rejects a web client token, even with the scope', async () => {
        const verifier = await loadVerifier();
        const token = signAccessToken({client_id: 'web-client', scope: 'openid email profile gitgazer-mcp/read'});
        await expect(verifier.verify(token)).rejects.toThrow(CognitoJwtInvalidClientIdError);
    });

    it('rejects an MCP client token without the gitgazer-mcp/read scope', async () => {
        const verifier = await loadVerifier();
        const token = signAccessToken({client_id: 'mcp-client', scope: 'openid email profile'});
        await expect(verifier.verify(token)).rejects.toThrow(JwtInvalidScopeError);
    });

    it('fails closed when the MCP client id is not configured', async () => {
        cognito.value = {userPoolId: USER_POOL_ID, clientId: 'web-client', mcpClientId: undefined};
        vi.resetModules();
        const {getMcpAccessVerifier} = await import('@/shared/middleware/token-verifier');
        expect(() => getMcpAccessVerifier()).toThrow(/not configured/);
    });
});
