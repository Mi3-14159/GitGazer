import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';
import config from '@gitgazer/backend-core/config';
import {getMcpAccessVerifier} from '@/shared/middleware/token-verifier';
import {db} from '@gitgazer/db/client';
import {users} from '@gitgazer/db/schema/gitgazer';
import {eq} from 'drizzle-orm';

/** Raised when an MCP request cannot be authenticated. Mapped to 401 by the route. */
export class McpAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'McpAuthError';
    }
}

export type McpCaller = {userId: number; integrationIds: string[]};

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
    return {userId: rows[0].id, integrationIds: Object.keys(roles)};
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
