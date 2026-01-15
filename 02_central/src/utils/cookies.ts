/**
 * Utility functions for managing httpOnly cookies for authentication tokens
 */

export interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    maxAge?: number; // in seconds
    path?: string;
    domain?: string;
}

const getIsProduction = () => process.env.NODE_ENV === 'production';

/**
 * Creates a Set-Cookie header value with security best practices
 */
export function createSetCookieHeader(name: string, value: string, options: CookieOptions = {}): string {
    const {
        httpOnly = true,
        secure = getIsProduction(),
        sameSite = 'Strict',
        maxAge,
        path = '/',
        domain,
    } = options;

    let cookie = `${name}=${value}`;

    if (maxAge !== undefined) {
        cookie += `; Max-Age=${maxAge}`;
    }

    cookie += `; Path=${path}`;

    if (domain) {
        cookie += `; Domain=${domain}`;
    }

    if (httpOnly) {
        cookie += '; HttpOnly';
    }

    if (secure) {
        cookie += '; Secure';
    }

    if (sameSite) {
        cookie += `; SameSite=${sameSite}`;
    }

    return cookie;
}

/**
 * Creates a Set-Cookie header to delete/clear a cookie
 */
export function createClearCookieHeader(name: string, options: Pick<CookieOptions, 'path' | 'domain'> = {}): string {
    const {path = '/', domain} = options;

    let cookie = `${name}=; Max-Age=0; Path=${path}`;

    if (domain) {
        cookie += `; Domain=${domain}`;
    }

    return cookie;
}

/**
 * Parse cookies from Cookie header string
 */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    if (!cookieHeader) {
        return {};
    }

    return cookieHeader.split(';').reduce(
        (cookies, cookie) => {
            const [name, ...rest] = cookie.split('=');
            const trimmedName = name?.trim();
            const trimmedValue = rest.join('=').trim();
            if (trimmedName && trimmedValue) {
                cookies[trimmedName] = trimmedValue;
            }
            return cookies;
        },
        {} as Record<string, string>,
    );
}

/**
 * Extract a specific cookie value from Cookie header
 */
export function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
    const cookies = parseCookies(cookieHeader);
    return cookies[name];
}

/**
 * Create Set-Cookie headers for Cognito tokens
 * Returns an array of Set-Cookie header values
 */
export function createTokenCookies(tokens: {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
    expiresIn?: number; // in seconds
}): string[] {
    const cookies: string[] = [];
    const {accessToken, idToken, refreshToken, expiresIn = 3600} = tokens;

    // Access token cookie (short-lived, used for API authorization)
    cookies.push(
        createSetCookieHeader('accessToken', accessToken, {
            httpOnly: true,
            secure: getIsProduction(),
            sameSite: 'Strict',
            maxAge: expiresIn,
            path: '/',
        }),
    );

    // ID token cookie (contains user claims)
    cookies.push(
        createSetCookieHeader('idToken', idToken, {
            httpOnly: true,
            secure: getIsProduction(),
            sameSite: 'Strict',
            maxAge: expiresIn,
            path: '/',
        }),
    );

    // Refresh token cookie (long-lived, used to get new tokens)
    if (refreshToken) {
        cookies.push(
            createSetCookieHeader('refreshToken', refreshToken, {
                httpOnly: true,
                secure: getIsProduction(),
                sameSite: 'Strict',
                maxAge: 30 * 24 * 60 * 60, // 30 days
                path: '/',
            }),
        );
    }

    return cookies;
}

/**
 * Create Set-Cookie headers to clear all auth cookies
 */
export function clearTokenCookies(): string[] {
    return [
        createClearCookieHeader('accessToken'),
        createClearCookieHeader('idToken'),
        createClearCookieHeader('refreshToken'),
    ];
}
