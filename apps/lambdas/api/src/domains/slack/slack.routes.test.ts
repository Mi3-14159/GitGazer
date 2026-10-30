import router from '@/domains/slack/slack.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';
import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const app = new Hono<AppEnv>().route('/api', router);

const mocks = vi.hoisted(() => ({
    completeSlackInstall: vi.fn(),
    buildSlackConnectRedirect: vi.fn(),
    completeSlackSignIn: vi.fn(),
    disconnectSlack: vi.fn(),
}));

vi.mock('@/domains/apps/slack-install', () => ({completeSlackInstall: mocks.completeSlackInstall}));
vi.mock('@/domains/slack/connect', () => ({
    buildSlackConnectRedirect: mocks.buildSlackConnectRedirect,
    completeSlackSignIn: mocks.completeSlackSignIn,
    disconnectSlack: mocks.disconnectSlack,
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const appContext = {
    userId: 1,
    username: '',
    email: '',
    name: '',
    nickname: '',
    picture: '',
    integrations: ['i1'],
    integrationRoles: {i1: 'viewer'} as const,
};

const request = (method: string, path: string) => testRequest(app, method, path, {appContext, cookies: ['oauthState=n']});

describe('slack routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.completeSlackInstall.mockResolvedValue({redirectUrl: 'https://app.example.com/x?slack=installed'});
        mocks.completeSlackSignIn.mockResolvedValue({redirectUrl: 'https://app.example.com/x?slack=connected'});
        mocks.buildSlackConnectRedirect.mockReturnValue({
            location: 'https://slack.com/openid/connect/authorize?state=s',
            stateCookie: 'oauthState=n2',
        });
        mocks.disconnectSlack.mockResolvedValue(undefined);
    });

    it('completes the install for the session user and clears the state cookie', async () => {
        const res = await request('GET', '/api/slack/oauth/callback?code=c&state=s');

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('https://app.example.com/x?slack=installed');
        expect(res.headers.getSetCookie().join()).toContain('oauthState=;');
        expect(mocks.completeSlackInstall).toHaveBeenCalledWith({
            code: 'c',
            state: 's',
            oauthStateNonce: 'n',
            userId: 1,
            integrationIds: ['i1'],
            integrationRoles: {i1: 'viewer'},
        });
    });

    it('starts Sign in with Slack for the session user', async () => {
        const res = await request('GET', '/api/integrations/i1/slack/connect?redirect_url=https://app.example.com/x&userId=99');

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('https://slack.com/openid/connect/authorize?state=s');
        expect(res.headers.getSetCookie().join()).toContain('oauthState=n2');
        expect(mocks.buildSlackConnectRedirect).toHaveBeenCalledWith({integrationId: 'i1', userId: 1, redirectUrl: 'https://app.example.com/x'});
    });

    it('rejects connect for a non-member', async () => {
        const res = await request('GET', '/api/integrations/i2/slack/connect?redirect_url=https://app.example.com/x');

        expect(res.status).toBe(403);
        expect(mocks.buildSlackConnectRedirect).not.toHaveBeenCalled();
    });

    it('completes Sign in with Slack for the session user and clears the state cookie', async () => {
        const res = await request('GET', '/api/slack/sign-in/callback?code=c&state=s');

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('https://app.example.com/x?slack=connected');
        expect(res.headers.getSetCookie().join()).toContain('oauthState=;');
        expect(mocks.completeSlackSignIn).toHaveBeenCalledWith({
            code: 'c',
            state: 's',
            oauthStateNonce: 'n',
            userId: 1,
            integrationIds: ['i1'],
            integrationRoles: {i1: 'viewer'},
        });
    });

    it('disconnects only the session user', async () => {
        const res = await request('DELETE', '/api/integrations/i1/slack/connection');

        expect(res.status).toBe(204);
        expect(mocks.disconnectSlack).toHaveBeenCalledWith({integrationId: 'i1', integrationIds: ['i1'], userId: 1});
    });
});
