/**
 * Shared cookie utilities for parsing and building HTTP cookies.
 */

const COOKIE_OPTIONS = 'Secure; HttpOnly; SameSite=Lax; Path=/';
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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
