import config from '@/shared/config';
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
