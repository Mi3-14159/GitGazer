import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';
import config from '@gitgazer/backend-core/config';
import {getMcpAccessVerifier} from '@/shared/middleware/token-verifier';
import {db} from '@gitgazer/db/client';
import {users} from '@gitgazer/db/schema/gitgazer';
import type {MemberRole} from '@gitgazer/db/types/members';
import {OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier} from '@modelcontextprotocol/server';
import {eq} from 'drizzle-orm';

/** Raised when an MCP request cannot be authenticated. Mapped to 401 by the route. */
export class McpAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'McpAuthError';
    }
}

export type McpCaller = {userId: number; integrationRoles: Record<string, MemberRole>};

const BEARER = /^Bearer\s+(.+)$/i;

/**
 * Authenticate an MCP request from its `Authorization: Bearer <cognito-access-token>` header:
 * verify the token, resolve the GitGazer user, and return the integrations (tenants) it may read.
 */
export const resolveMcpCaller = async (authorizationHeader: string | undefined): Promise<McpCaller> => {
    if (!authorizationHeader) throw new McpAuthError('Missing Authorization: Bearer token');
    const match = BEARER.exec(authorizationHeader.trim());
    if (!match) throw new McpAuthError('Malformed Authorization header');

    let sub: string;
    try {
        const payload = await getMcpAccessVerifier().verify(match[1]);
        sub = payload.sub;
    } catch {
        throw new McpAuthError('Invalid or expired access token');
    }

    const rows = await db.select({id: users.id}).from(users).where(eq(users.cognitoId, sub)).limit(1);
    if (rows.length === 0) throw new McpAuthError('Unknown user — sign in to GitGazer via the web app first');

    const roles = await getUserIntegrationRoles(rows[0].id);
    return {userId: rows[0].id, integrationRoles: roles};
};

/** Verifies a Cognito access token for the SDK's `requireBearerAuth` and resolves the GitGazer user. */
export const mcpTokenVerifier: OAuthTokenVerifier = {
    async verifyAccessToken(token) {
        let payload;
        try {
            payload = await getMcpAccessVerifier().verify(token);
        } catch {
            throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or expired access token');
        }

        const rows = await db.select({id: users.id}).from(users).where(eq(users.cognitoId, payload.sub)).limit(1);
        if (rows.length === 0) throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown user, sign in to GitGazer via the web app first');

        return {
            token,
            clientId: String(payload.client_id),
            scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
            expiresAt: payload.exp,
            extra: {userId: rows[0].id},
        };
    },
};

export const mcpUserId = (authInfo: AuthInfo | undefined): number => {
    const userId = authInfo?.extra?.userId;
    if (typeof userId !== 'number') throw new Error('Missing user id in auth info');
    return userId;
};

// The public MCP URL is configured (the CloudFront/custom domain), because behind CloudFront
// the web function only sees its own endpoint host. Falls back to the request domain for
// local dev where mcpServerUrl is unset.
export const mcpServerUrl = (requestOrigin: string): string => config.get('mcpServerUrl') || `${requestOrigin}/api/mcp`;

/** Public origin of the MCP deployment (e.g. `https://app.gitgazer.com`). */
export const mcpOrigin = (requestOrigin: string): string => new URL(mcpServerUrl(requestOrigin)).origin;

/** URL advertised in the `WWW-Authenticate` challenge on a 401 (RFC 9728). */
export const protectedResourceMetadataUrl = (requestOrigin: string): string => `${mcpOrigin(requestOrigin)}/.well-known/oauth-protected-resource`;

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728). Points clients at OUR authorization-server
 * facade (the OAuth proxy) rather than Cognito directly, so registration-based discovery works
 * and MCP clients connect without manual client-ID prompts.
 */
export const buildProtectedResourceMetadata = (requestOrigin: string): Record<string, unknown> => {
    return {
        resource: mcpServerUrl(requestOrigin),
        authorization_servers: [mcpOrigin(requestOrigin)],
        bearer_methods_supported: ['header'],
        scopes_supported: ['openid', 'email', 'profile'],
    };
};
