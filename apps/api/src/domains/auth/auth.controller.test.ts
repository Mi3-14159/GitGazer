import {BadRequestError, ForbiddenError} from '@aws-lambda-powertools/event-handler/http';
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';

const mockConfigGet = vi.fn((key: string): unknown => {
    switch (key) {
        case 'stateSecret':
            return 'unit-test-state-secret';
        case 'allowedFrontendOrigins':
            return ['https://app.example.com'];
        case 'cognito':
            return {
                userPoolId: 'pool-1',
                clientId: 'client-123',
                clientSecret: 'cognito-secret',
                domain: 'auth.example.com',
                redirectUri: 'https://api.example.com/api/auth/callback',
            };
        default:
            return '';
    }
});

vi.mock('@/shared/config', () => ({
    default: {
        get: (key: string): unknown => mockConfigGet(key),
    },
}));

import {buildLoginRedirect, handleOAuthCallback, mintStateToken, verifyStateToken} from './auth.controller';

const ALLOWED_ORIGIN = 'https://app.example.com';

const mockFetch = vi.fn();

const tokenResponse = (): Response =>
    new Response(JSON.stringify({access_token: 'a-token', id_token: 'i-token', refresh_token: 'r-token', expires_in: 3600, token_type: 'Bearer'}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
    });

/** Extract the raw nonce stored in an `oauthState=<nonce>; ...` cookie string. */
const nonceFromCookie = (cookie: string): string => cookie.split(';')[0].split('=')[1];

beforeAll(() => {
    vi.stubGlobal('fetch', mockFetch);
});

afterAll(() => {
    vi.unstubAllGlobals();
});

beforeEach(() => {
    mockFetch.mockReset();
});

describe('mintStateToken / verifyStateToken', () => {
    it('round-trips a freshly minted token against its nonce', () => {
        const {token, nonce} = mintStateToken({redirect_url: ALLOWED_ORIGIN});

        expect(token.split('.')).toHaveLength(2);
        expect(nonce).toMatch(/^[0-9a-f]{32}$/);

        const decoded = verifyStateToken(token, nonce);
        expect(decoded).not.toBeNull();
        expect(decoded?.redirect_url).toBe(ALLOWED_ORIGIN);
        expect(decoded?.nonce).toBe(nonce);
    });

    it('rejects a token with a tampered signature', () => {
        const {token, nonce} = mintStateToken({redirect_url: ALLOWED_ORIGIN});
        const [payload] = token.split('.');
        const forged = `${payload}.deadbeefdeadbeefdeadbeefdeadbeef`;

        expect(verifyStateToken(forged, nonce)).toBeNull();
    });

    it('rejects a valid token presented with the wrong nonce', () => {
        const {token} = mintStateToken({redirect_url: ALLOWED_ORIGIN});

        expect(verifyStateToken(token, 'a-different-nonce')).toBeNull();
    });

    it('rejects when the nonce cookie is missing', () => {
        const {token} = mintStateToken({redirect_url: ALLOWED_ORIGIN});

        expect(verifyStateToken(token, null)).toBeNull();
    });

    it('rejects a malformed token', () => {
        expect(verifyStateToken('not-a-valid-token', 'some-nonce')).toBeNull();
        expect(verifyStateToken('', 'some-nonce')).toBeNull();
        expect(verifyStateToken(undefined, 'some-nonce')).toBeNull();
    });

    describe('expiry', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('rejects an expired token', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
            const {token, nonce} = mintStateToken({redirect_url: ALLOWED_ORIGIN});

            // Advance past the 10-minute TTL.
            vi.setSystemTime(new Date('2026-01-01T00:10:01Z'));
            expect(verifyStateToken(token, nonce)).toBeNull();
        });

        it('accepts a token still within the TTL', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
            const {token, nonce} = mintStateToken({redirect_url: ALLOWED_ORIGIN});

            vi.setSystemTime(new Date('2026-01-01T00:09:59Z'));
            expect(verifyStateToken(token, nonce)).not.toBeNull();
        });
    });
});

describe('buildLoginRedirect', () => {
    it('mints a state cookie and redirects to the Cognito hosted UI with a verifiable state', () => {
        const {location, stateCookie} = buildLoginRedirect(ALLOWED_ORIGIN);

        const url = new URL(location);
        expect(url.origin + url.pathname).toBe('https://auth.example.com/oauth2/authorize');
        expect(url.searchParams.get('client_id')).toBe('client-123');
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.com/api/auth/callback');
        expect(url.searchParams.get('scope')).toContain('openid');

        const state = url.searchParams.get('state');
        expect(state).toBeTruthy();

        // The state cookie carries the httpOnly nonce that binds the signed state.
        expect(stateCookie).toContain('oauthState=');
        expect(stateCookie).toContain('HttpOnly');
        expect(stateCookie).toContain('Secure');
        expect(stateCookie).toContain('SameSite=Lax');

        const decoded = verifyStateToken(state ?? undefined, nonceFromCookie(stateCookie));
        expect(decoded?.redirect_url).toBe(ALLOWED_ORIGIN);
    });

    it('rejects a missing redirect_url', () => {
        expect(() => buildLoginRedirect(undefined)).toThrow(BadRequestError);
    });

    it('rejects a redirect_url whose origin is not allow-listed', () => {
        expect(() => buildLoginRedirect('https://evil.example.net')).toThrow(BadRequestError);
    });
});

describe('handleOAuthCallback', () => {
    it('exchanges the code exactly once when the state nonce is valid', async () => {
        const {token, nonce} = mintStateToken({redirect_url: ALLOWED_ORIGIN});
        mockFetch.mockResolvedValue(tokenResponse());

        const result = await handleOAuthCallback({code: 'auth-code', state: token, oauthStateNonce: nonce});

        expect(result.redirectUrl).toBe(ALLOWED_ORIGIN);
        expect(result.cookies.length).toBeGreaterThan(0);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does NOT exchange the code when the state signature is forged', async () => {
        const {token, nonce} = mintStateToken({redirect_url: ALLOWED_ORIGIN});
        const [payload] = token.split('.');
        const forged = `${payload}.deadbeefdeadbeefdeadbeefdeadbeef`;

        const error = await handleOAuthCallback({code: 'auth-code', state: forged, oauthStateNonce: nonce}).catch((e: unknown) => e as Error);

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does NOT exchange the code when the nonce does not match the cookie', async () => {
        const {token} = mintStateToken({redirect_url: ALLOWED_ORIGIN});

        const error = await handleOAuthCallback({code: 'auth-code', state: token, oauthStateNonce: 'wrong-nonce'}).catch((e: unknown) => e as Error);

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does NOT exchange the code when the nonce cookie is missing', async () => {
        const {token} = mintStateToken({redirect_url: ALLOWED_ORIGIN});

        const error = await handleOAuthCallback({code: 'auth-code', state: token, oauthStateNonce: null}).catch((e: unknown) => e as Error);

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does NOT exchange the code when the state token is expired', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const {token, nonce} = mintStateToken({redirect_url: ALLOWED_ORIGIN});
        vi.setSystemTime(new Date('2026-01-01T00:10:01Z'));

        const error = await handleOAuthCallback({code: 'auth-code', state: token, oauthStateNonce: nonce}).catch((e: unknown) => e as Error);
        vi.useRealTimers();

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does NOT exchange the code when the authorization code is missing', async () => {
        const {token, nonce} = mintStateToken({redirect_url: ALLOWED_ORIGIN});

        const error = await handleOAuthCallback({code: undefined, state: token, oauthStateNonce: nonce}).catch((e: unknown) => e as Error);

        expect(error).toBeInstanceOf(BadRequestError);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does NOT exchange the code when the state parameter is missing', async () => {
        const error = await handleOAuthCallback({code: 'auth-code', state: undefined, oauthStateNonce: 'some-nonce'}).catch((e: unknown) => e as Error);

        expect(error).toBeInstanceOf(BadRequestError);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects (before exchange) a verified state whose redirect_url origin is not allow-listed', async () => {
        // A correctly signed token can still carry a disallowed origin; it must be
        // rejected by validateRedirectUrl before any token exchange happens.
        const {token, nonce} = mintStateToken({redirect_url: 'https://evil.example.net'});

        const error = await handleOAuthCallback({code: 'auth-code', state: token, oauthStateNonce: nonce}).catch((e: unknown) => e as Error);

        expect(error).toBeInstanceOf(BadRequestError);
        expect(mockFetch).not.toHaveBeenCalled();
    });
});
