import {beforeEach, describe, expect, it, vi} from 'vitest';

const proxyFetch = vi.hoisted(() => vi.fn());
vi.mock('./proxy-fetch', () => ({proxyFetch}));
vi.mock('../config', () => ({
    default: {
        get: (key: string) =>
            ({
                'slackApp.clientId': 'client-id',
                'slackApp.clientSecret': 'client-secret',
                'slackApp.installRedirectUri': 'https://app.example/install',
                'slackApp.signInRedirectUri': 'https://app.example/signin',
            })[key],
    },
}));

import {
    buildInstallUrl,
    buildSignInUrl,
    exchangeInstallCode,
    exchangeSignInCode,
    isRevokedSlackError,
    listChannels,
    lookupUserByEmail,
    postMessage,
    revokeToken,
    SLACK_BOT_SCOPES,
    SlackApiError,
} from './slack.client';

const reply = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);
const lastCall = () =>
    proxyFetch.mock.calls[proxyFetch.mock.calls.length - 1] as [string, {method?: string; headers: Record<string, string>; body?: string}];

beforeEach(() => {
    proxyFetch.mockReset();
});

describe('URL builders', () => {
    it('builds the install URL', () => {
        const url = new URL(buildInstallUrl('st'));
        expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            client_id: 'client-id',
            scope: SLACK_BOT_SCOPES.join(','),
            redirect_uri: 'https://app.example/install',
            state: 'st',
        });
    });

    it('builds the sign-in URL', () => {
        const url = new URL(buildSignInUrl('st', 'nn'));
        expect(url.origin + url.pathname).toBe('https://slack.com/openid/connect/authorize');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            response_type: 'code',
            scope: 'openid',
            client_id: 'client-id',
            redirect_uri: 'https://app.example/signin',
            state: 'st',
            nonce: 'nn',
        });
    });
});

describe('exchangeInstallCode', () => {
    it('posts a form and maps the response', async () => {
        proxyFetch.mockResolvedValue(
            reply({
                ok: true,
                access_token: 'xoxb-1',
                bot_user_id: 'UBOT',
                team: {id: 'T1', name: 'Acme'},
                is_enterprise_install: false,
            }),
        );

        const result = await exchangeInstallCode('the-code');

        const [url, init] = lastCall();
        expect(url).toBe('https://slack.com/api/oauth.v2.access');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
            client_id: 'client-id',
            client_secret: 'client-secret',
            code: 'the-code',
            redirect_uri: 'https://app.example/install',
        });
        expect(result).toEqual({teamId: 'T1', teamName: 'Acme', botUserId: 'UBOT', botToken: 'xoxb-1', isEnterpriseInstall: false});
    });

    it('returns isEnterpriseInstall for org-wide installs where team is null', async () => {
        proxyFetch.mockResolvedValue(reply({ok: true, access_token: 'xoxb-1', bot_user_id: 'UBOT', team: null, is_enterprise_install: true}));

        const result = await exchangeInstallCode('the-code');

        expect(result.isEnterpriseInstall).toBe(true);
    });

    it('maps ok:false to SlackApiError without leaking the code', async () => {
        proxyFetch.mockResolvedValue(reply({ok: false, error: 'invalid_code'}));
        const error = await exchangeInstallCode('secret-code').catch((e) => e);
        expect(error).toBeInstanceOf(SlackApiError);
        expect(error.code).toBe('invalid_code');
        expect(error.message).not.toContain('secret-code');
        expect(error.message).not.toContain('client-secret');
    });
});

describe('exchangeSignInCode', () => {
    it('exchanges the code, then reads user info with the user token', async () => {
        proxyFetch
            .mockResolvedValueOnce(reply({ok: true, access_token: 'xoxp-1'}))
            .mockResolvedValueOnce(reply({ok: true, 'https://slack.com/user_id': 'U1', 'https://slack.com/team_id': 'T1'}));

        const result = await exchangeSignInCode('the-code');

        const [first, second] = proxyFetch.mock.calls as [string, {method?: string; headers: Record<string, string>; body?: string}][];
        expect(first[0]).toBe('https://slack.com/api/openid.connect.token');
        expect(Object.fromEntries(new URLSearchParams(first[1].body))).toEqual({
            client_id: 'client-id',
            client_secret: 'client-secret',
            code: 'the-code',
            redirect_uri: 'https://app.example/signin',
        });
        expect(second[0]).toBe('https://slack.com/api/openid.connect.userInfo');
        expect(second[1].headers.Authorization).toBe('Bearer xoxp-1');
        expect(result).toEqual({slackUserId: 'U1', teamId: 'T1'});
    });
});

describe('revokeToken', () => {
    it('calls auth.revoke with the bearer token', async () => {
        proxyFetch.mockResolvedValue(reply({ok: true, revoked: true}));
        await revokeToken('xoxb-1');
        const [url, init] = lastCall();
        expect(url).toBe('https://slack.com/api/auth.revoke');
        expect(init.headers.Authorization).toBe('Bearer xoxb-1');
    });
});

describe('listChannels', () => {
    it('follows next_cursor and sorts by name', async () => {
        proxyFetch
            .mockResolvedValueOnce(
                reply({ok: true, channels: [{id: 'C2', name: 'zeta', is_private: false}], response_metadata: {next_cursor: 'abc'}}),
            )
            .mockResolvedValueOnce(reply({ok: true, channels: [{id: 'C1', name: 'alpha', is_private: true}], response_metadata: {next_cursor: ''}}));

        const channels = await listChannels('xoxb-1');

        const urls = proxyFetch.mock.calls.map((c) => new URL(c[0] as string));
        expect(urls).toHaveLength(2);
        expect(Object.fromEntries(urls[0].searchParams)).toEqual({
            types: 'public_channel,private_channel',
            exclude_archived: 'true',
            limit: '200',
        });
        expect(urls[1].searchParams.get('cursor')).toBe('abc');
        expect(proxyFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer xoxb-1');
        expect(channels).toEqual([
            {id: 'C1', name: 'alpha', isPrivate: true},
            {id: 'C2', name: 'zeta', isPrivate: false},
        ]);
    });
});

describe('postMessage', () => {
    it('posts JSON with the channel merged into the payload', async () => {
        proxyFetch.mockResolvedValue(reply({ok: true}));
        const payload = {text: 'hi', attachments: [{color: '#fff', blocks: []}]} as const;

        await postMessage('xoxb-1', 'C1', payload as never);

        const [url, init] = lastCall();
        expect(url).toBe('https://slack.com/api/chat.postMessage');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/json; charset=utf-8');
        expect(init.headers.Authorization).toBe('Bearer xoxb-1');
        expect(JSON.parse(init.body!)).toEqual({channel: 'C1', ...payload});
    });
});

describe('lookupUserByEmail', () => {
    it('returns the user id', async () => {
        proxyFetch.mockResolvedValue(reply({ok: true, user: {id: 'U1', deleted: false, is_bot: false}}));
        await expect(lookupUserByEmail('xoxb-1', 'a+b@example.com')).resolves.toBe('U1');
        const url = new URL(lastCall()[0]);
        expect(url.pathname).toBe('/api/users.lookupByEmail');
        expect(url.searchParams.get('email')).toBe('a+b@example.com');
    });

    it('returns null for users_not_found', async () => {
        proxyFetch.mockResolvedValue(reply({ok: false, error: 'users_not_found'}));
        await expect(lookupUserByEmail('xoxb-1', 'a@example.com')).resolves.toBeNull();
    });

    it('returns null for deleted users and bots', async () => {
        proxyFetch.mockResolvedValueOnce(reply({ok: true, user: {id: 'U1', deleted: true}}));
        proxyFetch.mockResolvedValueOnce(reply({ok: true, user: {id: 'U2', is_bot: true}}));
        await expect(lookupUserByEmail('xoxb-1', 'a@example.com')).resolves.toBeNull();
        await expect(lookupUserByEmail('xoxb-1', 'b@example.com')).resolves.toBeNull();
    });

    it('does not leak token or email in errors', async () => {
        proxyFetch.mockResolvedValue(reply({ok: false, error: 'invalid_auth'}));
        const error = await lookupUserByEmail('xoxb-secret', 'person@example.com').catch((e) => e);
        expect(error).toBeInstanceOf(SlackApiError);
        expect(error.message).not.toContain('xoxb-secret');
        expect(error.message).not.toContain('person@example.com');
    });
});

describe('rate limiting', () => {
    it('maps HTTP 429 to ratelimited with retryAfterMs', async () => {
        proxyFetch.mockResolvedValue(new Response('', {status: 429, headers: {'Retry-After': '7'}}));
        const error = await postMessage('xoxb-1', 'C1', {} as never).catch((e) => e);
        expect(error).toBeInstanceOf(SlackApiError);
        expect(error.code).toBe('ratelimited');
        expect(error.retryAfterMs).toBe(7000);
    });
});

describe('isRevokedSlackError', () => {
    it.each(['invalid_auth', 'token_revoked', 'account_inactive', 'not_authed', 'token_expired'])('is true for %s', (code) => {
        expect(isRevokedSlackError(new SlackApiError(code))).toBe(true);
    });

    it('is false for other errors', () => {
        expect(isRevokedSlackError(new SlackApiError('channel_not_found'))).toBe(false);
        expect(isRevokedSlackError(new Error('invalid_auth'))).toBe(false);
    });
});
