import config from '@gitgazer/backend-core/config';
import {CognitoJwtVerifier} from 'aws-jwt-verify';

type TokenVerifiers = {
    accessTokenVerifier: ReturnType<typeof CognitoJwtVerifier.create>;
    idTokenVerifier: ReturnType<typeof CognitoJwtVerifier.create>;
};

let verifiers: TokenVerifiers | null = null;

/**
 * Lazily create and cache the Cognito access + id token verifiers.
 *
 * Lives in its own module (rather than the auth middleware) so it can be shared by
 * both the cookie-based `authenticate` middleware and the MCP bearer-token auth
 * without creating an import cycle through the public-routes registry.
 */
export const getVerifiers = (): TokenVerifiers => {
    if (!verifiers) {
        const {userPoolId, clientId} = config.get('cognito');

        verifiers = {
            accessTokenVerifier: CognitoJwtVerifier.create({
                userPoolId,
                clientId,
                tokenUse: 'access',
            }),
            idTokenVerifier: CognitoJwtVerifier.create({
                userPoolId,
                clientId,
                tokenUse: 'id',
            }),
        };
    }
    return verifiers;
};

/** Verify a Cognito access token (used by the MCP server's bearer auth). */
export const verifyAccessToken = (token: string) => getVerifiers().accessTokenVerifier.verify(token);

let mcpAccessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

/**
 * Access-token verifier for the MCP server. Accepts tokens from either the web app client
 * or the dedicated public MCP client, so both an OAuth-obtained MCP token and a user's
 * existing web access token are valid bearer credentials.
 */
export const getMcpAccessVerifier = (): ReturnType<typeof CognitoJwtVerifier.create> => {
    if (!mcpAccessVerifier) {
        const {userPoolId, clientId, mcpClientId} = config.get('cognito');
        const clientIds = [clientId, mcpClientId].filter(Boolean);
        if (clientIds.length === 0) {
            // Fail closed: passing `clientId: null` to aws-jwt-verify disables client_id validation
            // entirely, accepting ANY access token in the user pool. Surface the misconfiguration.
            throw new Error('MCP token verifier is not configured (no Cognito client IDs)');
        }
        mcpAccessVerifier = CognitoJwtVerifier.create({
            userPoolId,
            clientId: clientIds,
            tokenUse: 'access',
        });
    }
    return mcpAccessVerifier;
};
