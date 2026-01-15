import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {
    createSetCookieHeader,
    createClearCookieHeader,
    parseCookies,
    getCookie,
    createTokenCookies,
    clearTokenCookies,
} from './cookies';

describe('Cookie Utilities', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
        process.env.NODE_ENV = 'test';
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
    });

    describe('createSetCookieHeader', () => {
        it('should create a basic cookie with default options', () => {
            const result = createSetCookieHeader('testCookie', 'testValue');
            expect(result).toContain('testCookie=testValue');
            expect(result).toContain('Path=/');
            expect(result).toContain('HttpOnly');
            expect(result).toContain('SameSite=Strict');
        });

        it('should include MaxAge when provided', () => {
            const result = createSetCookieHeader('testCookie', 'testValue', {maxAge: 3600});
            expect(result).toContain('Max-Age=3600');
        });

        it('should include Domain when provided', () => {
            const result = createSetCookieHeader('testCookie', 'testValue', {domain: '.example.com'});
            expect(result).toContain('Domain=.example.com');
        });

        it('should include Secure flag in production', () => {
            process.env.NODE_ENV = 'production';
            const result = createSetCookieHeader('testCookie', 'testValue');
            expect(result).toContain('Secure');
        });

        it('should not include Secure flag in non-production', () => {
            process.env.NODE_ENV = 'development';
            const result = createSetCookieHeader('testCookie', 'testValue');
            expect(result).not.toContain('Secure');
        });

        it('should allow custom SameSite values', () => {
            const result = createSetCookieHeader('testCookie', 'testValue', {sameSite: 'Lax'});
            expect(result).toContain('SameSite=Lax');
        });

        it('should allow disabling HttpOnly', () => {
            const result = createSetCookieHeader('testCookie', 'testValue', {httpOnly: false});
            expect(result).not.toContain('HttpOnly');
        });
    });

    describe('createClearCookieHeader', () => {
        it('should create a cookie with Max-Age=0', () => {
            const result = createClearCookieHeader('testCookie');
            expect(result).toContain('testCookie=');
            expect(result).toContain('Max-Age=0');
            expect(result).toContain('Path=/');
        });

        it('should include custom path', () => {
            const result = createClearCookieHeader('testCookie', {path: '/api'});
            expect(result).toContain('Path=/api');
        });

        it('should include domain when provided', () => {
            const result = createClearCookieHeader('testCookie', {domain: '.example.com'});
            expect(result).toContain('Domain=.example.com');
        });
    });

    describe('parseCookies', () => {
        it('should parse a single cookie', () => {
            const result = parseCookies('name=value');
            expect(result).toEqual({name: 'value'});
        });

        it('should parse multiple cookies', () => {
            const result = parseCookies('name1=value1; name2=value2; name3=value3');
            expect(result).toEqual({
                name1: 'value1',
                name2: 'value2',
                name3: 'value3',
            });
        });

        it('should handle cookies with equals signs in values', () => {
            const result = parseCookies('jwt=eyJhbGc.eyJzdWI.SflKxw==');
            expect(result).toEqual({jwt: 'eyJhbGc.eyJzdWI.SflKxw=='});
        });

        it('should handle empty string', () => {
            const result = parseCookies('');
            expect(result).toEqual({});
        });

        it('should handle undefined', () => {
            const result = parseCookies(undefined);
            expect(result).toEqual({});
        });

        it('should trim whitespace around cookie names and values', () => {
            const result = parseCookies(' name1 = value1 ; name2 = value2 ');
            expect(result).toEqual({
                name1: 'value1',
                name2: 'value2',
            });
        });
    });

    describe('getCookie', () => {
        it('should extract a specific cookie value', () => {
            const result = getCookie('name1=value1; name2=value2', 'name2');
            expect(result).toBe('value2');
        });

        it('should return undefined for non-existent cookie', () => {
            const result = getCookie('name1=value1', 'name2');
            expect(result).toBeUndefined();
        });

        it('should return undefined for undefined cookie header', () => {
            const result = getCookie(undefined, 'name');
            expect(result).toBeUndefined();
        });
    });

    describe('createTokenCookies', () => {
        it('should create cookies for access and ID tokens', () => {
            const tokens = {
                accessToken: 'access-token-value',
                idToken: 'id-token-value',
            };
            const result = createTokenCookies(tokens);

            expect(result).toHaveLength(2);
            expect(result[0]).toContain('accessToken=access-token-value');
            expect(result[0]).toContain('Max-Age=3600');
            expect(result[1]).toContain('idToken=id-token-value');
            expect(result[1]).toContain('Max-Age=3600');
        });

        it('should create cookie for refresh token when provided', () => {
            const tokens = {
                accessToken: 'access-token-value',
                idToken: 'id-token-value',
                refreshToken: 'refresh-token-value',
            };
            const result = createTokenCookies(tokens);

            expect(result).toHaveLength(3);
            expect(result[2]).toContain('refreshToken=refresh-token-value');
            expect(result[2]).toContain('Max-Age=2592000'); // 30 days
        });

        it('should use custom expiresIn value', () => {
            const tokens = {
                accessToken: 'access-token-value',
                idToken: 'id-token-value',
                expiresIn: 7200,
            };
            const result = createTokenCookies(tokens);

            expect(result[0]).toContain('Max-Age=7200');
            expect(result[1]).toContain('Max-Age=7200');
        });

        it('should set HttpOnly, SameSite=Strict on all cookies', () => {
            const tokens = {
                accessToken: 'access-token-value',
                idToken: 'id-token-value',
                refreshToken: 'refresh-token-value',
            };
            const result = createTokenCookies(tokens);

            result.forEach((cookie) => {
                expect(cookie).toContain('HttpOnly');
                expect(cookie).toContain('SameSite=Strict');
            });
        });
    });

    describe('clearTokenCookies', () => {
        it('should create clear cookies for all auth tokens', () => {
            const result = clearTokenCookies();

            expect(result).toHaveLength(3);
            expect(result[0]).toContain('accessToken=');
            expect(result[0]).toContain('Max-Age=0');
            expect(result[1]).toContain('idToken=');
            expect(result[1]).toContain('Max-Age=0');
            expect(result[2]).toContain('refreshToken=');
            expect(result[2]).toContain('Max-Age=0');
        });
    });
});
