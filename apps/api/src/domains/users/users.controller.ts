import {proxyFetch} from '@/shared/clients/proxy-fetch';
import config from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {BadRequestError, InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {createHash, timingSafeEqual} from 'crypto';

type OAuthTokenBody = {
    code?: string;
    client_id?: string;
    client_secret?: string;
};

/**
 * Constant-time equality check for two strings.
 *
 * Both values are hashed to fixed-length SHA-256 digests before comparison so that
 * {@link timingSafeEqual} always receives equal-length buffers (it throws otherwise)
 * and the comparison leaks neither the length nor the content of the expected value.
 */
const constantTimeEquals = (provided: string, expected: string): boolean => {
    const providedDigest = createHash('sha256').update(provided).digest();
    const expectedDigest = createHash('sha256').update(expected).digest();
    return timingSafeEqual(providedDigest, expectedDigest);
};

/**
 * Authenticate the caller of the OAuth relay endpoint.
 *
 * `POST /api/auth/cognito/token` is a public, unauthenticated route (the global Cognito
 * authorizer cannot run on the endpoint Cognito itself calls). Its only legitimate caller
 * is the Cognito GitHub identity provider, which authenticates with the OAuth app
 * credentials (`client_secret_post`). Validating those credentials here ensures an attacker
 * who merely holds an intercepted authorization `code` cannot drive the exchange: they would
 * also need the OAuth app secret, which only Cognito and GitHub possess.
 *
 * This is distinct from the exchange itself, which always sends the server-held credentials
 * to GitHub and never forwards caller-supplied ones. Here the caller credentials are used
 * solely to authenticate the caller, never to talk to GitHub.
 */
export const assertCognitoCaller = (clientId: string | undefined, clientSecret: string | undefined): void => {
    const expectedClientId = config.get('githubOAuthApp.clientId');
    const expectedClientSecret = config.get('githubOAuthApp.clientSecret');

    if (!expectedClientId || !expectedClientSecret) {
        // Fail closed: treat missing configuration as a server fault rather than silently
        // authenticating a caller that supplies empty credentials against empty expected values.
        getLogger().error('GitHub OAuth app credentials are not configured');
        throw new InternalServerError('GitHub OAuth is not configured');
    }

    // Evaluate both comparisons before branching so control flow does not reveal which of
    // the two credentials was wrong.
    const idMatches = constantTimeEquals(clientId ?? '', expectedClientId);
    const secretMatches = constantTimeEquals(clientSecret ?? '', expectedClientSecret);

    if (!idMatches || !secretMatches) {
        getLogger().warn('Rejected OAuth token request with invalid client credentials');
        throw new UnauthorizedError('Invalid client credentials');
    }
};

export const parseOAuthTokenBody = (body: string, isBase64Encoded: boolean): OAuthTokenBody => {
    if (isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf-8');
    }

    const result: Record<string, string> = {};
    body.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        try {
            result[key] = decodeURIComponent(value);
        } catch {
            // decodeURIComponent throws URIError on malformed percent-encoding.
            throw new BadRequestError('Malformed request body');
        }
    });

    return result as OAuthTokenBody;
};

/**
 * Exchange an OAuth code for a GitHub access token.
 *
 * The GitHub OAuth app credentials sent to GitHub are always sourced from server
 * configuration — caller-supplied client credentials are never forwarded upstream.
 * (Caller credentials are validated separately by {@link assertCognitoCaller} to
 * authenticate the caller; they are never used to talk to GitHub.) Only the
 * authorization `code` from the request participates in the exchange.
 */
export const exchangeGitHubOAuthToken = async (code: string): Promise<unknown> => {
    const oauthClientId = config.get('githubOAuthApp.clientId');
    const oauthClientSecret = config.get('githubOAuthApp.clientSecret');

    if (!oauthClientId || !oauthClientSecret) {
        // Misconfiguration (e.g. the infra secret was not deployed). Fail loudly server-side
        // instead of sending empty credentials to GitHub and surfacing a confusing error.
        getLogger().error('GitHub OAuth app credentials are not configured');
        throw new InternalServerError('GitHub OAuth is not configured');
    }

    const response = await proxyFetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({client_id: oauthClientId, client_secret: oauthClientSecret, code}),
    });

    if (!response.ok) {
        // A non-2xx is an upstream/GitHub failure. Log the status server-side only; never
        // reflect upstream text to the caller.
        getLogger().error('GitHub OAuth token exchange failed', {status: response.status});
        throw new InternalServerError('Failed to exchange GitHub OAuth token');
    }

    const token: unknown = await response.json();

    // GitHub returns HTTP 200 with an error body (e.g. bad_verification_code) for invalid,
    // expired, or already-used codes. That is a client error: surface a 400 without
    // reflecting the upstream error text to the caller.
    if (token !== null && typeof token === 'object' && 'error' in token) {
        getLogger().error('GitHub OAuth token exchange returned an error body', {error: (token as {error?: unknown}).error});
        throw new BadRequestError('Failed to exchange GitHub OAuth token');
    }

    return token;
};

/**
 * Fetch the GitHub user profile using an authorization header.
 */
export const fetchGitHubUser = async (authorizationHeader: string): Promise<{status: number; body: string; headers: Record<string, string>}> => {
    const response = await proxyFetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
            authorization: authorizationHeader,
            accept: 'application/json',
        },
    });

    if (!response.ok) {
        // Log the upstream status server-side only; the caller receives a generic body.
        getLogger().error('Failed to fetch GitHub user info', {status: response.status});
        return {
            status: response.status,
            body: JSON.stringify({error: 'Failed to fetch user info from GitHub'}),
            headers: {
                'Cache-Control': 'no-cache, no-store, max-age=0',
                'Content-Type': 'application/json',
            },
        };
    }

    const user = await response.json();

    return {
        status: response.status,
        body: JSON.stringify({sub: user.id, ...user}),
        headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Content-Type': 'application/json',
        },
    };
};
