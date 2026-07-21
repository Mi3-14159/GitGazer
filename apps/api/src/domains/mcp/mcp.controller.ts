import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';
import config from '@/shared/config';
import {getVerifiers} from '@/shared/middleware/token-verifier';
import {db} from '@gitgazer/db/client';
import {users} from '@gitgazer/db/schema/gitgazer';
import {APIGatewayProxyEventV2} from 'aws-lambda';
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
        const {accessTokenVerifier} = getVerifiers();
        const payload = await accessTokenVerifier.verify(match[1]);
        sub = payload.sub;
    } catch {
        throw new McpAuthError('Invalid or expired access token');
    }

    const rows = await db.select({id: users.id}).from(users).where(eq(users.cognitoId, sub)).limit(1);
    if (rows.length === 0) throw new McpAuthError('Unknown user — sign in to GitGazer via the web app first');

    const roles = await getUserIntegrationRoles(rows[0].id);
    return {userId: rows[0].id, integrationIds: Object.keys(roles)};
};

const baseUrl = (event: APIGatewayProxyEventV2): string => `https://${event.requestContext.domainName}`;

/** URL advertised in the `WWW-Authenticate` challenge on a 401 (RFC 9728). */
export const protectedResourceMetadataUrl = (event: APIGatewayProxyEventV2): string => `${baseUrl(event)}/.well-known/oauth-protected-resource`;

/** OAuth 2.0 Protected Resource Metadata (RFC 9728) pointing clients at the Cognito user pool. */
export const buildProtectedResourceMetadata = (event: APIGatewayProxyEventV2): Record<string, unknown> => {
    const {userPoolId} = config.get('cognito');
    const region = userPoolId.split('_')[0] || '';
    const issuer = region ? `https://cognito-idp.${region}.amazonaws.com/${userPoolId}` : '';
    return {
        resource: `${baseUrl(event)}/api/mcp`,
        authorization_servers: issuer ? [issuer] : [],
    };
};
