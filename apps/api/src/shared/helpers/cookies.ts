/**
 * Shared cookie utilities for parsing and building HTTP cookies.
 */

const COOKIE_OPTIONS = 'Secure; HttpOnly; SameSite=Lax; Path=/';
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const STATE_COOKIE_MAX_AGE = 600; // 10 minutes — short-lived OAuth state nonce

/** Cookie name holding the OAuth state nonce that binds the signed state token to the browser. */
export const OAUTH_STATE_COOKIE_NAME = 'oauthState';

export function extractTokenFromCookies(cookies: string[] | undefined, tokenName: string): string | null {
    if (!cookies || cookies.length === 0) {
        return null;
    }

    for (const cookieString of cookies) {
        const cookiePairs = cookieString.split(';').map((c) => c.trim());
        for (const cookie of cookiePairs) {
            const [name, value] = cookie.split('=');
            if (name === tokenName) {
                return value;
            }
        }
    }

    return null;
}

export function buildAuthCookies(tokens: {access_token: string; id_token: string; refresh_token?: string; expires_in: number}): string[] {
    const cookies = [
        `accessToken=${tokens.access_token}; ${COOKIE_OPTIONS}; Max-Age=${tokens.expires_in}`,
        `idToken=${tokens.id_token}; ${COOKIE_OPTIONS}; Max-Age=${tokens.expires_in}`,
    ];

    if (tokens.refresh_token) {
        cookies.push(`refreshToken=${tokens.refresh_token}; ${COOKIE_OPTIONS}; Max-Age=${REFRESH_TOKEN_MAX_AGE}`);
    }

    return cookies;
}

export function buildClearCookies(): string[] {
    return [`accessToken=; ${COOKIE_OPTIONS}; Max-Age=0`, `idToken=; ${COOKIE_OPTIONS}; Max-Age=0`, `refreshToken=; ${COOKIE_OPTIONS}; Max-Age=0`];
}

/**
 * Build the short-lived httpOnly cookie holding the OAuth state nonce.
 * `SameSite=Lax` is required so the cookie is returned on the top-level GET
 * navigation back from the Cognito hosted UI to the callback endpoint.
 */
export function buildStateCookie(nonce: string): string {
    return `${OAUTH_STATE_COOKIE_NAME}=${nonce}; ${COOKIE_OPTIONS}; Max-Age=${STATE_COOKIE_MAX_AGE}`;
}

export function buildClearStateCookie(): string {
    return `${OAUTH_STATE_COOKIE_NAME}=; ${COOKIE_OPTIONS}; Max-Age=0`;
}
