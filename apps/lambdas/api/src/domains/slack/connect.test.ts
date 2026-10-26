import {BadRequestError, ForbiddenError, NotFoundError} from '@aws-lambda-powertools/event-handler/http';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
    logger: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
    exchangeSignInCode: vi.fn(),
    findSlackTeamId: vi.fn(),
    saveSignInLink: vi.fn(),
    blockAutoLink: vi.fn(),
    githubIdRows: [] as {githubId: number | null}[],
}));

vi.mock('@gitgazer/backend-core/config', () => ({
    default: {
        get: (key: string): unknown => ({stateSecret: 'unit-test-state-secret', allowedFrontendOrigins: ['https://app.example.com']})[key] ?? '',
    },
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => mocks.logger}));
vi.mock('@gitgazer/backend-core/clients/slack.client', () => ({
    buildSignInUrl: (state: string, nonce: string) => `https://slack.com/openid/connect/authorize?${new URLSearchParams({state, nonce})}`,
    exchangeSignInCode: mocks.exchangeSignInCode,
}));
vi.mock('@gitgazer/backend-services/slack/link-store', () => ({saveSignInLink: mocks.saveSignInLink, blockAutoLink: mocks.blockAutoLink}));
vi.mock('@/domains/apps/apps.controller', () => ({findSlackTeamId: mocks.findSlackTeamId}));
vi.mock('@gitgazer/db/client', () => ({
    db: {select: () => ({from: () => ({where: () => Promise.resolve(mocks.githubIdRows)})})},
    withRlsTransaction: (params: {callback: (tx: unknown) => unknown}) => params.callback({}),
}));

import {mintSignedState, verifySignedState} from '@/domains/auth/auth.controller';
import {buildSlackConnectRedirect, completeSlackSignIn, disconnectSlack} from './connect';

const CODE = 'oauth-code-123';
const SLACK_USER_ID = 'U0SECRET1';
const REDIRECT = 'https://app.example.com/integrations/int-1?tab=members';

const nonceFromCookie = (cookie: string): string => cookie.split(';')[0].split('=')[1];

const callback = (overrides: {purpose?: string; stateUserId?: number; roles?: Record<string, 'viewer'>; code?: string | undefined} = {}) => {
    const {token, nonce} = mintSignedState({
        purpose: overrides.purpose ?? 'slack_sign_in',
        integrationId: 'int-1',
        userId: overrides.stateUserId ?? 7,
        redirect_url: REDIRECT,
    });
    return completeSlackSignIn({
        code: 'code' in overrides ? overrides.code : CODE,
        state: token,
        oauthStateNonce: nonce,
        userId: 7,
        integrationIds: ['int-1'],
        integrationRoles: overrides.roles ?? {'int-1': 'viewer'},
    });
};

const redirectParams = (redirectUrl: string) => Object.fromEntries(new URL(redirectUrl).searchParams);

beforeEach(() => {
    vi.clearAllMocks();
    mocks.githubIdRows = [{githubId: 4242}];
    mocks.findSlackTeamId.mockResolvedValue('T1');
    mocks.exchangeSignInCode.mockResolvedValue({slackUserId: SLACK_USER_ID, teamId: 'T1'});
});

describe('buildSlackConnectRedirect', () => {
    it('connect redirect is scoped to the caller', () => {
        const {location, stateCookie} = buildSlackConnectRedirect({integrationId: 'int-1', userId: 7, redirectUrl: REDIRECT});

        const url = new URL(location);
        expect(location.startsWith('https://slack.com/openid/connect/authorize')).toBe(true);
        expect(url.searchParams.get('nonce')).toBe(nonceFromCookie(stateCookie));
        expect(verifySignedState(url.searchParams.get('state') ?? undefined, nonceFromCookie(stateCookie))).toMatchObject({
            purpose: 'slack_sign_in',
            integrationId: 'int-1',
            userId: 7,
            redirect_url: REDIRECT,
        });
    });

    it('rejects a redirect_url whose origin is not allow-listed', () => {
        expect(() => buildSlackConnectRedirect({integrationId: 'int-1', userId: 7, redirectUrl: 'https://evil.example.net'})).toThrow(
            BadRequestError,
        );
        expect(() => buildSlackConnectRedirect({integrationId: 'int-1', userId: 7, redirectUrl: undefined})).toThrow(BadRequestError);
    });
});

describe('completeSlackSignIn', () => {
    it('callback links the caller with slack_sign_in', async () => {
        const {redirectUrl} = await callback();

        expect(redirectParams(redirectUrl)).toEqual({tab: 'members', slack: 'connected'});
        expect(mocks.findSlackTeamId).toHaveBeenCalledWith(expect.anything(), 'int-1');
        expect(mocks.saveSignInLink).toHaveBeenCalledWith('T1', 4242, SLACK_USER_ID, expect.any(Date));

        const logged = JSON.stringify(Object.values(mocks.logger).map((fn) => fn.mock.calls));
        expect(logged).not.toContain(SLACK_USER_ID);
        expect(logged).not.toContain(CODE);
    });

    it('callback rejects another workspace', async () => {
        mocks.exchangeSignInCode.mockResolvedValue({slackUserId: SLACK_USER_ID, teamId: 'T-OTHER'});

        const {redirectUrl} = await callback();

        expect(redirectParams(redirectUrl)).toEqual({tab: 'members', slack_error: 'workspace_mismatch'});
        expect(mocks.saveSignInLink).not.toHaveBeenCalled();
    });

    it('callback rejects a non-member', async () => {
        const {redirectUrl} = await callback({roles: {}});

        expect(redirectParams(redirectUrl)).toMatchObject({slack_error: 'failed'});
        expect(mocks.exchangeSignInCode).not.toHaveBeenCalled();
        expect(mocks.saveSignInLink).not.toHaveBeenCalled();
    });

    it('callback rejects a state minted for another user or purpose', async () => {
        await expect(callback({stateUserId: 8})).rejects.toBeInstanceOf(ForbiddenError);
        await expect(callback({purpose: 'slack_install'})).rejects.toBeInstanceOf(ForbiddenError);
        expect(mocks.exchangeSignInCode).not.toHaveBeenCalled();
    });

    it('callback fails closed when Slack omits the user or team', async () => {
        for (const claims of [
            {slackUserId: undefined, teamId: 'T1'},
            {slackUserId: 'not-a-user-id', teamId: 'T1'},
            {slackUserId: SLACK_USER_ID, teamId: undefined},
            {slackUserId: SLACK_USER_ID, teamId: ''},
        ]) {
            mocks.exchangeSignInCode.mockResolvedValue(claims);

            expect(redirectParams((await callback()).redirectUrl)).toMatchObject({slack_error: 'failed'});
        }
        expect(mocks.saveSignInLink).not.toHaveBeenCalled();
    });

    it('callback fails without a code, a Slack app or a GitHub account', async () => {
        expect(redirectParams((await callback({code: undefined})).redirectUrl)).toMatchObject({slack_error: 'failed'});

        mocks.findSlackTeamId.mockResolvedValue(undefined);
        expect(redirectParams((await callback()).redirectUrl)).toMatchObject({slack_error: 'failed'});

        mocks.findSlackTeamId.mockResolvedValue('T1');
        mocks.githubIdRows = [{githubId: null}];
        expect(redirectParams((await callback()).redirectUrl)).toMatchObject({slack_error: 'failed'});

        expect(mocks.exchangeSignInCode).not.toHaveBeenCalled();
        expect(mocks.saveSignInLink).not.toHaveBeenCalled();
    });
});

describe('disconnectSlack', () => {
    it('disconnect blocks automatic re-linking', async () => {
        await disconnectSlack({integrationId: 'int-1', integrationIds: ['int-1'], userId: 7});

        expect(mocks.findSlackTeamId).toHaveBeenCalledWith(expect.anything(), 'int-1');
        expect(mocks.blockAutoLink).toHaveBeenCalledWith('T1', 4242, expect.any(Date));
    });

    it('disconnect fails when the integration has no Slack app', async () => {
        mocks.findSlackTeamId.mockResolvedValue(undefined);

        await expect(disconnectSlack({integrationId: 'int-1', integrationIds: ['int-1'], userId: 7})).rejects.toBeInstanceOf(NotFoundError);
        expect(mocks.blockAutoLink).not.toHaveBeenCalled();
    });
});
