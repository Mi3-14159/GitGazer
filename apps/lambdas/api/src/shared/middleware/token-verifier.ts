import {MCP_SCOPE} from '@/shared/mcp-scope';
import config from '@gitgazer/backend-core/config';
import {CognitoJwtVerifier} from 'aws-jwt-verify';

type TokenVerifiers = {
    accessTokenVerifier: ReturnType<typeof CognitoJwtVerifier.create>;
    idTokenVerifier: ReturnType<typeof CognitoJwtVerifier.create>;
};

let verifiers: TokenVerifiers | null = null;

/** Lazily create and cache the web client's access + id token verifiers for the cookie-based `authenticate` middleware. */
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

let mcpAccessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

/** Access-token verifier for the MCP server: only tokens from the MCP client that carry the MCP scope. */
export const getMcpAccessVerifier = (): ReturnType<typeof CognitoJwtVerifier.create> => {
    if (!mcpAccessVerifier) {
        const {userPoolId, mcpClientId} = config.get('cognito');
        if (!mcpClientId) {
            // Fail closed: passing `clientId: null` to aws-jwt-verify disables client_id validation
            // entirely, accepting ANY access token in the user pool. Surface the misconfiguration.
            throw new Error('MCP token verifier is not configured (no MCP Cognito client ID)');
        }
        mcpAccessVerifier = CognitoJwtVerifier.create({
            userPoolId,
            clientId: mcpClientId,
            tokenUse: 'access',
            scope: MCP_SCOPE,
        });
    }
    return mcpAccessVerifier;
};
