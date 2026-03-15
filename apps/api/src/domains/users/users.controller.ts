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
 */
export const exchangeGitHubOAuthToken = async (clientId: string, clientSecret: string, code: string): Promise<unknown> => {
    const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({client_id: clientId, client_secret: clientSecret, code}),
    });
    return response.json();
};

/**
 * Fetch the GitHub user profile using an authorization header.
 */
export const fetchGitHubUser = async (authorizationHeader: string): Promise<{status: number; body: string; headers: Record<string, string>}> => {
    const response = await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
            authorization: authorizationHeader,
            accept: 'application/json',
        },
    });

    if (!response.ok) {
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
