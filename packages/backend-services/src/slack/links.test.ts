import {SlackApiError} from '@gitgazer/backend-core/clients/slack.client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {mockLogger, memberRows} = vi.hoisted(() => ({
    mockLogger: {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()},
    memberRows: {rows: [] as unknown[]},
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => mockLogger}));

const mockWithRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: unknown[]) => mockWithRlsTransaction(...args),
}));
const memberTx = {
    select: () => {
        const chain = {from: () => chain, innerJoin: () => chain, where: () => Promise.resolve(memberRows.rows)};
        return chain;
    },
};

const mockLookupUserByEmail = vi.fn();
vi.mock('@gitgazer/backend-core/clients/slack.client', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@gitgazer/backend-core/clients/slack.client')>()),
    lookupUserByEmail: (...args: unknown[]) => mockLookupUserByEmail(...args),
}));

const mockRequest = vi.fn();
const mockGetInstallationOctokit = vi.fn();
vi.mock('@gitgazer/backend-core/clients/github-app.client', () => ({
    getInstallationOctokit: (...args: unknown[]) => mockGetInstallationOctokit(...args),
}));

const mockFindInstallationId = vi.fn();
vi.mock('../alerting/log-details', () => ({
    findInstallationId: (...args: unknown[]) => mockFindInstallationId(...args),
}));

const mockGetLink = vi.fn();
const mockSaveLookupResult = vi.fn();
vi.mock('./link-store', () => ({
    getLink: (...args: unknown[]) => mockGetLink(...args),
    saveLookupResult: (...args: unknown[]) => mockSaveLookupResult(...args),
}));

const mockLoadWorkspaceForIntegration = vi.fn();
vi.mock('./workspaces', () => ({
    loadWorkspaceForIntegration: (...args: unknown[]) => mockLoadWorkspaceForIntegration(...args),
}));

import {LINK_MEMBERS_BUDGET_MS, linkIntegrationMembers, NOT_FOUND_REFRESH_MS, PROFILE_LINK_REFRESH_MS, resolveSlackUserId} from './links';

const now = new Date('2026-10-26T10:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const params = {teamId: 'T1', botToken: 'xoxb-1', integrationId: 'int-1', githubUserId: 42, githubLogin: 'octo', ownerLogin: 'acme', now};

const link = (values: {slackUserId?: string | null; source?: string | null; checkedAt?: Date; autoLinkBlocked?: boolean}) => ({
    slackUserId: null,
    source: null,
    checkedAt: now,
    autoLinkBlocked: false,
    ...values,
});

const containsEmail = (value: unknown): boolean => {
    if (typeof value === 'string') return value.includes('@');
    if (value instanceof Date || value === null || typeof value !== 'object') return false;
    return Object.values(value).some(containsEmail);
};

const expectNoLookup = () => {
    expect(mockGetInstallationOctokit).not.toHaveBeenCalled();
    expect(mockLookupUserByEmail).not.toHaveBeenCalled();
    expect(mockSaveLookupResult).not.toHaveBeenCalled();
};

describe('links', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        memberRows.rows = [];
        mockGetLink.mockResolvedValue(null);
        mockSaveLookupResult.mockResolvedValue(undefined);
        mockFindInstallationId.mockResolvedValue(7);
        mockGetInstallationOctokit.mockReturnValue({request: mockRequest});
        mockRequest.mockResolvedValue({data: {email: 'octo@example.com'}});
        mockLookupUserByEmail.mockResolvedValue('U2');
        mockWithRlsTransaction.mockImplementation(async (p: {callback: (tx: typeof memberTx) => unknown}) => p.callback(memberTx));
        mockLoadWorkspaceForIntegration.mockResolvedValue({teamId: 'T1', botToken: 'xoxb-1', disconnected: false});
    });

    it('refreshes profile links after 7 days and not-found after 24 hours', () => {
        expect(PROFILE_LINK_REFRESH_MS).toBe(7 * DAY);
        expect(NOT_FOUND_REFRESH_MS).toBe(DAY);
    });

    describe('resolveSlackUserId', () => {
        it('uses a fresh found link without calling Slack', async () => {
            mockGetLink.mockResolvedValue(link({slackUserId: 'U1', source: 'github_profile_email', checkedAt: ago(6 * DAY)}));

            await expect(resolveSlackUserId(params)).resolves.toBe('U1');
            expect(mockGetLink).toHaveBeenCalledWith('T1', 42);
            expectNoLookup();
        });

        it('rechecks a found link after 7 days', async () => {
            mockGetLink.mockResolvedValue(link({slackUserId: 'U1', source: 'github_profile_email', checkedAt: ago(8 * DAY)}));

            await expect(resolveSlackUserId(params)).resolves.toBe('U2');
            expect(mockFindInstallationId).toHaveBeenCalledWith('int-1', 'acme');
            expect(mockGetInstallationOctokit).toHaveBeenCalledWith(7);
            expect(mockRequest).toHaveBeenCalledWith('GET /users/{username}', {username: 'octo'});
            expect(mockLookupUserByEmail).toHaveBeenCalledWith('xoxb-1', 'octo@example.com');
            expect(mockSaveLookupResult).toHaveBeenCalledWith({
                teamId: 'T1',
                githubUserId: 42,
                slackUserId: 'U2',
                source: 'github_profile_email',
                now,
            });
        });

        it('rechecks not-found after 24 hours', async () => {
            mockGetLink.mockResolvedValue(link({checkedAt: ago(23 * HOUR)}));
            await expect(resolveSlackUserId(params)).resolves.toBeNull();
            expectNoLookup();

            mockGetLink.mockResolvedValue(link({checkedAt: ago(25 * HOUR)}));
            await expect(resolveSlackUserId(params)).resolves.toBe('U2');
            expect(mockSaveLookupResult).toHaveBeenCalledWith(expect.objectContaining({slackUserId: 'U2', source: 'github_profile_email'}));
        });

        it('keeps a gitgazer_email link without calling Slack', async () => {
            mockGetLink.mockResolvedValue(link({slackUserId: 'U1', source: 'gitgazer_email', checkedAt: ago(30 * DAY)}));

            await expect(resolveSlackUserId(params)).resolves.toBe('U1');
            expectNoLookup();
        });

        it('skips the profile email without a GitHub App installation', async () => {
            mockFindInstallationId.mockResolvedValue(null);

            await expect(resolveSlackUserId(params)).resolves.toBeNull();
            expectNoLookup();
        });

        it('stores not-found when the profile has no public email', async () => {
            mockGetLink.mockResolvedValue(link({slackUserId: 'U1', source: 'github_profile_email', checkedAt: ago(8 * DAY)}));
            mockRequest.mockResolvedValue({data: {email: null}});

            await expect(resolveSlackUserId(params)).resolves.toBeNull();
            expect(mockLookupUserByEmail).not.toHaveBeenCalled();
            expect(mockSaveLookupResult).toHaveBeenCalledWith({
                teamId: 'T1',
                githubUserId: 42,
                slackUserId: null,
                source: 'github_profile_email',
                now,
            });
        });

        it('stores not-found when no email matches', async () => {
            mockLookupUserByEmail.mockResolvedValue(null);

            await expect(resolveSlackUserId(params)).resolves.toBeNull();
            expect(mockSaveLookupResult).toHaveBeenCalledWith({
                teamId: 'T1',
                githubUserId: 42,
                slackUserId: null,
                source: 'github_profile_email',
                now,
            });
        });

        it('lookup failure neither mentions nor caches', async () => {
            mockLookupUserByEmail.mockRejectedValue(new SlackApiError('ratelimited', 1000));

            await expect(resolveSlackUserId(params)).resolves.toBeNull();
            expect(mockSaveLookupResult).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalled();
            expect(containsEmail([mockLogger.info.mock.calls, mockLogger.warn.mock.calls, mockLogger.error.mock.calls])).toBe(false);
        });

        it('a failing GitHub profile read keeps the stored link and writes nothing', async () => {
            mockGetLink.mockResolvedValue(link({slackUserId: 'U1', source: 'github_profile_email', checkedAt: ago(8 * DAY)}));
            mockRequest.mockRejectedValue(Object.assign(new Error('Not Found'), {status: 404}));

            await expect(resolveSlackUserId(params)).resolves.toBe('U1');
            expect(mockSaveLookupResult).not.toHaveBeenCalled();
        });

        it('never overwrites a slack_sign_in link', async () => {
            mockGetLink.mockResolvedValue(link({slackUserId: 'U9', source: 'slack_sign_in', checkedAt: ago(365 * DAY)}));

            await expect(resolveSlackUserId(params)).resolves.toBe('U9');
            expectNoLookup();
        });

        it('blocked link is not looked up', async () => {
            mockGetLink.mockResolvedValue(link({autoLinkBlocked: true, checkedAt: ago(365 * DAY)}));

            await expect(resolveSlackUserId(params)).resolves.toBeNull();
            expectNoLookup();
        });
    });

    describe('linkIntegrationMembers', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('looks up every member with a GitHub account through any installation', async () => {
            memberRows.rows = [
                {githubId: 1, githubLogin: 'one'},
                {githubId: null, githubLogin: null},
                {githubId: 2, githubLogin: 'two'},
            ];
            mockLookupUserByEmail.mockResolvedValueOnce('U1').mockResolvedValueOnce(null);

            await expect(linkIntegrationMembers('T1', 'int-1')).resolves.toEqual({linked: 1, checked: 2});
            expect(mockLoadWorkspaceForIntegration).toHaveBeenCalledWith('int-1');
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({integrationIds: ['int-1']}));
            expect(mockFindInstallationId).toHaveBeenCalledWith('int-1', null);
            expect(mockRequest.mock.calls.map(([, p]) => p.username)).toEqual(['one', 'two']);
            expect(mockSaveLookupResult.mock.calls.map(([p]) => [p.githubUserId, p.slackUserId])).toEqual([
                [1, 'U1'],
                [2, null],
            ]);
        });

        it('stops looking up members once the budget is used up', async () => {
            vi.useFakeTimers({toFake: ['Date']});
            memberRows.rows = [
                {githubId: 1, githubLogin: 'one'},
                {githubId: 2, githubLogin: 'two'},
            ];
            mockLookupUserByEmail.mockImplementation(async () => {
                vi.advanceTimersByTime(LINK_MEMBERS_BUDGET_MS);
                return 'U1';
            });

            await expect(linkIntegrationMembers('T1', 'int-1')).resolves.toEqual({linked: 1, checked: 1});
            expect(LINK_MEMBERS_BUDGET_MS).toBe(60_000);
            expect(mockRequest.mock.calls.map(([, p]) => p.username)).toEqual(['one']);
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.any(String), {integrationId: 'int-1', linked: 1, checked: 1});
        });

        it.each([
            ['missing', null],
            ['disconnected', {teamId: 'T1', botToken: 'xoxb-1', disconnected: true}],
            ['another workspace', {teamId: 'T2', botToken: 'xoxb-2', disconnected: false}],
        ])('skips a %s workspace', async (_case, workspace) => {
            mockLoadWorkspaceForIntegration.mockResolvedValue(workspace);
            memberRows.rows = [{githubId: 1, githubLogin: 'one'}];

            await expect(linkIntegrationMembers('T1', 'int-1')).resolves.toEqual({linked: 0, checked: 0});
            expect(mockGetLink).not.toHaveBeenCalled();
            expectNoLookup();
        });
    });
});
