import {BadRequestError, ForbiddenError} from '@/shared/errors';
import {integrationAppSlackSettings, integrationApps, slackWorkspaces} from '@gitgazer/db/schema/gitgazer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
    logger: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
    exchangeInstallCode: vi.fn(),
    revokeToken: vi.fn(),
    encryptToken: vi.fn(),
    sendSlackLookupTask: vi.fn(),
    findSlackTeamId: vi.fn(),
    logAppInstalled: vi.fn(),
    releaseWorkspaceIfUnused: vi.fn(),
    withRlsTransaction: vi.fn(),
    inserted: [] as {table: unknown; values: unknown}[],
    storedWorkspaces: [] as unknown[],
    upserts: [] as {table: unknown; values: unknown; set: unknown}[],
}));

vi.mock('@gitgazer/backend-core/config', () => ({
    default: {
        get: (key: string): unknown =>
            ({stateSecret: 'unit-test-state-secret', allowedFrontendOrigins: ['https://app.example.com'], webhookQueueUrl: 'https://queue'})[key] ??
            '',
    },
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => mocks.logger}));
vi.mock('@gitgazer/backend-core/clients/slack.client', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@gitgazer/backend-core/clients/slack.client')>()),
    buildInstallUrl: (state: string) => `https://slack.com/oauth/v2/authorize?state=${state}`,
    exchangeInstallCode: mocks.exchangeInstallCode,
    revokeToken: mocks.revokeToken,
}));
vi.mock('@gitgazer/backend-core/helpers/token-crypto', () => ({encryptToken: mocks.encryptToken}));
vi.mock('@gitgazer/backend-core/clients/sqs.client', () => ({sendSlackLookupTask: mocks.sendSlackLookupTask}));
vi.mock('@/domains/apps/apps.controller', () => ({
    findSlackTeamId: mocks.findSlackTeamId,
    logAppInstalled: mocks.logAppInstalled,
    releaseWorkspaceIfUnused: mocks.releaseWorkspaceIfUnused,
}));
vi.mock('@gitgazer/db/client', () => {
    const insert = (table: unknown) => ({
        values: (values: unknown) => {
            mocks.inserted.push({table, values});
            return Object.assign(Promise.resolve(undefined), {
                returning: () => Promise.resolve([{appId: 'app-s'}]),
                onConflictDoUpdate: ({set}: {set: unknown}) => {
                    mocks.upserts.push({table, values, set});
                    return Promise.resolve(undefined);
                },
            });
        },
    });
    const select = () => ({from: () => ({where: () => Promise.resolve(mocks.storedWorkspaces)})});
    return {db: {insert, select}, withRlsTransaction: (params: {callback: (tx: unknown) => unknown}) => mocks.withRlsTransaction(params, {insert})};
});

import {mintSignedState, verifySignedState} from '@/domains/auth/auth.controller';
import {buildSlackInstallRedirect, completeSlackInstall} from './slack-install';

const BOT_TOKEN = 'xoxb-very-secret-bot-token';
const CODE = 'oauth-code-123';
const REDIRECT = 'https://app.example.com/integrations/int-1?tab=apps';
const installation = {teamId: 'T1', teamName: 'Acme', botUserId: 'UBOT', botToken: BOT_TOKEN, isEnterpriseInstall: false};

const nonceFromCookie = (cookie: string): string => cookie.split(';')[0].split('=')[1];

const callback = (overrides: {purpose?: string; stateUserId?: number; role?: string; code?: string | undefined} = {}) => {
    const {token, nonce} = mintSignedState({
        purpose: overrides.purpose ?? 'slack_install',
        integrationId: 'int-1',
        userId: overrides.stateUserId ?? 7,
        redirect_url: REDIRECT,
    });
    return completeSlackInstall({
        code: 'code' in overrides ? overrides.code : CODE,
        state: token,
        oauthStateNonce: nonce,
        userId: 7,
        integrationIds: ['int-1'],
        integrationRoles: {'int-1': (overrides.role ?? 'admin') as 'admin'},
    });
};

const redirectParams = (redirectUrl: string) => Object.fromEntries(new URL(redirectUrl).searchParams);

describe('buildSlackInstallRedirect', () => {
    it('install redirect carries a signed state for the integration', () => {
        const {location, stateCookie} = buildSlackInstallRedirect({integrationId: 'int-1', userId: 7, redirectUrl: REDIRECT});

        const state = new URL(location).searchParams.get('state') ?? undefined;
        expect(location.startsWith('https://slack.com/oauth/v2/authorize')).toBe(true);
        expect(verifySignedState(state, nonceFromCookie(stateCookie))).toMatchObject({
            purpose: 'slack_install',
            integrationId: 'int-1',
            userId: 7,
            redirect_url: REDIRECT,
        });
    });

    it('rejects a redirect_url whose origin is not allow-listed', () => {
        expect(() => buildSlackInstallRedirect({integrationId: 'int-1', userId: 7, redirectUrl: 'https://evil.example.net'})).toThrow(
            BadRequestError,
        );
        expect(() => buildSlackInstallRedirect({integrationId: 'int-1', userId: 7, redirectUrl: undefined})).toThrow(BadRequestError);
    });
});

describe('completeSlackInstall', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.inserted.length = 0;
        mocks.upserts.length = 0;
        mocks.storedWorkspaces = [];
        mocks.exchangeInstallCode.mockResolvedValue(installation);
        mocks.encryptToken.mockResolvedValue('ciphertext');
        mocks.findSlackTeamId.mockResolvedValue(undefined);
        mocks.withRlsTransaction.mockImplementation((params: {callback: (tx: unknown) => unknown}, tx: unknown) => params.callback(tx));
    });

    it('callback rejects a state minted for another purpose', async () => {
        await expect(callback({purpose: 'slack_sign_in'})).rejects.toBeInstanceOf(ForbiddenError);

        const {token, nonce} = mintSignedState({redirect_url: REDIRECT});
        await expect(
            completeSlackInstall({code: CODE, state: token, oauthStateNonce: nonce, userId: 7, integrationIds: ['int-1'], integrationRoles: {}}),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(mocks.exchangeInstallCode).not.toHaveBeenCalled();
    });

    it('callback rejects a state minted for another user', async () => {
        await expect(callback({stateUserId: 8})).rejects.toBeInstanceOf(ForbiddenError);
        expect(mocks.exchangeInstallCode).not.toHaveBeenCalled();
    });

    it('callback requires the user to still be admin', async () => {
        const {redirectUrl} = await callback({role: 'member'});

        expect(redirectParams(redirectUrl)).toEqual({tab: 'apps', slack_error: 'failed'});
        expect(mocks.exchangeInstallCode).not.toHaveBeenCalled();
    });

    it('callback reports a cancelled consent (no code) as failed', async () => {
        const {redirectUrl} = await callback({code: undefined});

        expect(redirectParams(redirectUrl)).toMatchObject({slack_error: 'failed'});
        expect(mocks.exchangeInstallCode).not.toHaveBeenCalled();
    });

    it('callback rejects an enterprise install', async () => {
        mocks.exchangeInstallCode.mockResolvedValue({...installation, teamId: '', teamName: '', isEnterpriseInstall: true});

        const {redirectUrl} = await callback();

        expect(redirectParams(redirectUrl)).toMatchObject({slack_error: 'enterprise'});
        expect(mocks.revokeToken).toHaveBeenCalledWith(BOT_TOKEN);
        expect(mocks.upserts).toHaveLength(0);
        expect(mocks.inserted).toHaveLength(0);
    });

    it('callback rejects a second workspace for the same integration and revokes its unused token', async () => {
        mocks.findSlackTeamId.mockResolvedValue('T-OTHER');

        const {redirectUrl} = await callback();

        expect(redirectParams(redirectUrl)).toMatchObject({slack_error: 'workspace_mismatch'});
        expect(mocks.upserts).toHaveLength(0);
        expect(mocks.inserted).toHaveLength(0);
        expect(mocks.revokeToken).toHaveBeenCalledWith(BOT_TOKEN);
    });

    it('callback keeps the token on a workspace mismatch when GitGazer already holds that workspace', async () => {
        mocks.findSlackTeamId.mockResolvedValue('T-OTHER');
        mocks.storedWorkspaces = [{teamId: 'T1'}];

        const {redirectUrl} = await callback();

        expect(redirectParams(redirectUrl)).toMatchObject({slack_error: 'workspace_mismatch'});
        expect(mocks.revokeToken).not.toHaveBeenCalled();
    });

    it('callback encrypts the token and never logs it', async () => {
        const {redirectUrl} = await callback();

        expect(redirectParams(redirectUrl)).toEqual({tab: 'apps', slack: 'installed'});
        expect(mocks.encryptToken).toHaveBeenCalledWith(BOT_TOKEN);
        expect(mocks.upserts[0]).toMatchObject({
            table: slackWorkspaces,
            values: {teamId: 'T1', teamName: 'Acme', botUserId: 'UBOT', botTokenCiphertext: 'ciphertext'},
        });
        expect(JSON.stringify(mocks.upserts.map(({values, set}) => ({values, set})))).not.toContain(BOT_TOKEN);
        expect(mocks.inserted.map((i) => i.table)).toEqual([slackWorkspaces, integrationApps, integrationAppSlackSettings]);
        expect(mocks.inserted[2].values).toEqual({integrationId: 'int-1', appId: 'app-s', teamId: 'T1'});
        expect(mocks.logAppInstalled).toHaveBeenCalledWith('int-1', 'slack');
        expect(mocks.sendSlackLookupTask).toHaveBeenCalledWith('https://queue', {taskType: 'slack_lookup', teamId: 'T1', integrationId: 'int-1'});

        const logged = JSON.stringify(Object.values(mocks.logger).map((fn) => fn.mock.calls));
        expect(logged).not.toContain(BOT_TOKEN);
        expect(logged).not.toContain(CODE);
    });

    it('callback reuses an existing workspace and clears disconnected', async () => {
        mocks.findSlackTeamId.mockResolvedValue('T1');

        const {redirectUrl} = await callback();

        expect(redirectParams(redirectUrl)).toMatchObject({slack: 'installed'});
        expect(mocks.upserts[0].set).toMatchObject({botTokenCiphertext: 'ciphertext', disconnectedAt: null});
        expect(mocks.inserted.map((i) => i.table)).toEqual([slackWorkspaces]);
        expect(mocks.logAppInstalled).not.toHaveBeenCalled();
    });

    it('callback releases the workspace when the app cannot be added', async () => {
        mocks.withRlsTransaction.mockImplementation((params: {userName?: string; callback: (tx: unknown) => unknown}, tx: unknown) =>
            params.userName ? Promise.reject(new Error('insert failed')) : params.callback(tx),
        );

        const {redirectUrl} = await callback();

        expect(redirectParams(redirectUrl)).toMatchObject({slack_error: 'failed'});
        expect(mocks.upserts).toHaveLength(1);
        expect(mocks.releaseWorkspaceIfUnused).toHaveBeenCalledWith('int-1', 'T1');
        expect(mocks.logAppInstalled).not.toHaveBeenCalled();
    });

    it('callback reports failures without the token and still installs when the lookup cannot be queued', async () => {
        mocks.sendSlackLookupTask.mockRejectedValue(new Error('queue down'));

        expect(redirectParams((await callback()).redirectUrl)).toMatchObject({slack: 'installed'});

        mocks.encryptToken.mockRejectedValue(new Error('kms down'));

        expect(redirectParams((await callback()).redirectUrl)).toMatchObject({slack_error: 'failed'});
        expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(BOT_TOKEN);
    });
});
