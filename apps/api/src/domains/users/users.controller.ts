import {proxyFetch} from '@/shared/clients/proxy-fetch';
import config from '@/shared/config';
import {getLogger} from '@/shared/logger';

type OAuthTokenBody = {
    client_id: string;
    client_secret: string;
    code: string;
    grant_type: string;
    redirect_uri: string;
};

export const parseOAuthTokenBody = (body: string, isBase64Encoded: boolean): OAuthTokenBody => {
    if (isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf-8');
    }

    const result: Record<string, string> = {};
    body.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        result[key] = decodeURIComponent(value);
    });

    return result as OAuthTokenBody;
};

/**
 * Exchange an OAuth code for a GitHub access token.
 *
 * The GitHub OAuth app credentials are always sourced from server configuration.
 * The only legitimate caller is the Cognito identity provider, which is
 * configured with the same OAuth app, so caller-supplied client credentials are
 * never trusted — only the authorization `code` is accepted from the request.
 */
export const exchangeGitHubOAuthToken = async (code: string): Promise<unknown> => {
    const oauthClientId = config.get('githubOAuthApp.clientId');
    const oauthClientSecret = config.get('githubOAuthApp.clientSecret');

    const response = await proxyFetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({client_id: oauthClientId, client_secret: oauthClientSecret, code}),
    });

    if (!response.ok) {
        // Log the upstream status server-side only; never reflect upstream text to the caller.
        getLogger().error('GitHub OAuth token exchange failed', {status: response.status});
        throw new Error('Failed to exchange GitHub OAuth token');
    }

    const token: unknown = await response.json();

    // GitHub returns HTTP 200 with an error body (e.g. bad_verification_code) for invalid,
    // expired, or already-used codes. Detect that explicitly and surface a generic error
    // without reflecting the upstream error text to the caller.
    if (token !== null && typeof token === 'object' && 'error' in token) {
        getLogger().error('GitHub OAuth token exchange returned an error body', {error: (token as {error?: unknown}).error});
        throw new Error('Failed to exchange GitHub OAuth token');
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
