import {describe, expect, it} from 'vitest';

import {buildClearStateCookie, buildStateCookie, extractTokenFromCookies, getRequestCookies, OAUTH_STATE_COOKIE_NAME} from './cookies';

describe('buildStateCookie', () => {
    it('builds an httpOnly, secure, lax, short-lived state cookie', () => {
        const cookie = buildStateCookie('nonce-123');

        expect(cookie).toContain(`${OAUTH_STATE_COOKIE_NAME}=nonce-123`);
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/');
        expect(cookie).toContain('Max-Age=600');
    });
});

describe('buildClearStateCookie', () => {
    it('clears the state cookie with Max-Age=0', () => {
        const cookie = buildClearStateCookie();

        expect(cookie).toContain(`${OAUTH_STATE_COOKIE_NAME}=;`);
        expect(cookie).toContain('Max-Age=0');
        expect(cookie).toContain('HttpOnly');
    });
});

describe('extractTokenFromCookies', () => {
    it('extracts the state nonce from the cookie header', () => {
        const nonce = extractTokenFromCookies([`${OAUTH_STATE_COOKIE_NAME}=noncevalue`], OAUTH_STATE_COOKIE_NAME);

        expect(nonce).toBe('noncevalue');
    });

    it('returns null when the state cookie is absent', () => {
        expect(extractTokenFromCookies(['other=1'], OAUTH_STATE_COOKIE_NAME)).toBeNull();
        expect(extractTokenFromCookies(undefined, OAUTH_STATE_COOKIE_NAME)).toBeNull();
    });
});

describe('getRequestCookies', () => {
    const ctx = (cookie?: string) => ({req: {header: (name: string) => (name === 'cookie' ? cookie : undefined)}}) as never;

    it('splits the Cookie header into its pairs', () => {
        expect(getRequestCookies(ctx('a=1; b=2'))).toEqual(['a=1', 'b=2']);
    });

    it('splits pairs separated by a bare semicolon', () => {
        expect(getRequestCookies(ctx('a=1;b=2'))).toEqual(['a=1', 'b=2']);
    });

    it('returns an empty array without a Cookie header', () => {
        expect(getRequestCookies(ctx())).toEqual([]);
    });
});
