import type {SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {mockDb, workspaceRows, whereArgs, mockLogger} = vi.hoisted(() => {
    const workspaceRows: {rows: unknown[]} = {rows: []};
    const whereArgs: unknown[] = [];
    const chain = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: (condition: unknown) => {
            whereArgs.push(condition);
            return Promise.resolve(workspaceRows.rows);
        },
    };
    const mockDb = {selectDistinct: vi.fn(() => chain), insert: vi.fn()};
    const mockLogger = {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()};
    return {mockDb, workspaceRows, whereArgs, mockLogger};
});

vi.mock('@gitgazer/db/client', () => ({db: mockDb}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => mockLogger}));

const mockDecryptToken = vi.fn();
vi.mock('@gitgazer/backend-core/helpers/token-crypto', () => ({
    decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

const mockLookupUserByEmail = vi.fn();
vi.mock('@gitgazer/backend-core/clients/slack.client', () => ({
    lookupUserByEmail: (...args: unknown[]) => mockLookupUserByEmail(...args),
}));

const mockSaveLookupResult = vi.fn();
vi.mock('./link-store', () => ({
    saveLookupResult: (...args: unknown[]) => mockSaveLookupResult(...args),
}));

import {LOGIN_LOOKUP_BUDGET_MS, linkAtLogin} from './login-links';

const dialect = new PgDialect();

const workspace = (teamId: string, link: {source?: string | null; autoLinkBlocked?: boolean | null} = {}) => ({
    teamId,
    botTokenCiphertext: `cipher-${teamId}`,
    source: link.source ?? null,
    autoLinkBlocked: link.autoLinkBlocked ?? null,
});

const savedTeams = () => mockSaveLookupResult.mock.calls.map(([params]) => params.teamId);

const containsEmail = (value: unknown): boolean => {
    if (typeof value === 'string') return value.includes('@');
    if (value instanceof Date || value === null || typeof value !== 'object') return false;
    return Object.values(value).some(containsEmail);
};

describe('linkAtLogin', () => {
    beforeEach(() => {
        workspaceRows.rows = [];
        whereArgs.length = 0;
        mockDecryptToken.mockImplementation(async (ciphertext: string) => ciphertext.replace('cipher-', 'token-'));
        mockLookupUserByEmail.mockResolvedValue(null);
        mockSaveLookupResult.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('budget is 2 seconds', () => {
        expect(LOGIN_LOOKUP_BUDGET_MS).toBe(2000);
    });

    it('links the user in every connected workspace of their integrations', async () => {
        workspaceRows.rows = [workspace('T1'), workspace('T2')];
        mockLookupUserByEmail.mockImplementation(async (token: string) => (token === 'token-T1' ? 'U1' : 'U2'));

        await linkAtLogin(42, async () => ['a@example.com']);

        const {params} = dialect.sqlToQuery(whereArgs[0] as SQL);
        expect(params).toContain(42);
        expect(mockSaveLookupResult).toHaveBeenCalledWith({
            teamId: 'T1',
            githubUserId: 42,
            slackUserId: 'U1',
            source: 'gitgazer_email',
            now: expect.any(Date),
        });
        expect(mockSaveLookupResult).toHaveBeenCalledWith({
            teamId: 'T2',
            githubUserId: 42,
            slackUserId: 'U2',
            source: 'gitgazer_email',
            now: expect.any(Date),
        });
    });

    it('tries emails in order and stores the first match', async () => {
        workspaceRows.rows = [workspace('T1')];
        mockLookupUserByEmail.mockImplementation(async (_token: string, email: string) =>
            email === 'b@example.com' ? 'UB' : email === 'c@example.com' ? 'UC' : null,
        );

        await linkAtLogin(42, async () => ['a@example.com', 'b@example.com', 'c@example.com']);

        expect(mockLookupUserByEmail.mock.calls).toEqual([
            ['token-T1', 'a@example.com'],
            ['token-T1', 'b@example.com'],
        ]);
        expect(mockSaveLookupResult).toHaveBeenCalledWith(expect.objectContaining({teamId: 'T1', slackUserId: 'UB'}));
    });

    it('stores not found when no email matches', async () => {
        workspaceRows.rows = [workspace('T1')];

        await linkAtLogin(42, async () => ['a@example.com', 'b@example.com']);

        expect(mockLookupUserByEmail).toHaveBeenCalledTimes(2);
        expect(mockSaveLookupResult).toHaveBeenCalledWith(expect.objectContaining({teamId: 'T1', slackUserId: null, source: 'gitgazer_email'}));
    });

    it('skips disconnected workspaces', async () => {
        await linkAtLogin(42, async () => ['a@example.com']);

        expect(dialect.sqlToQuery(whereArgs[0] as SQL).sql).toMatch(/"slack_workspaces"\."disconnected_at" is null/);
    });

    it('skips workspaces where the user signed in with Slack or blocked automatic linking', async () => {
        workspaceRows.rows = [
            workspace('T1', {source: 'slack_sign_in', autoLinkBlocked: false}),
            workspace('T2', {autoLinkBlocked: true}),
            workspace('T3'),
        ];

        await linkAtLogin(42, async () => ['a@example.com']);

        expect(mockDecryptToken).toHaveBeenCalledTimes(1);
        expect(savedTeams()).toEqual(['T3']);
    });

    it('does nothing without emails', async () => {
        workspaceRows.rows = [workspace('T1')];

        await linkAtLogin(42, async () => []);

        expect(mockDb.selectDistinct).not.toHaveBeenCalled();
        expect(mockSaveLookupResult).not.toHaveBeenCalled();
    });

    it('a failing workspace does not stop the others', async () => {
        workspaceRows.rows = [workspace('T1'), workspace('T2')];
        mockLookupUserByEmail.mockImplementation(async (token: string) => {
            if (token === 'token-T1') throw new Error('ratelimited');
            return 'U2';
        });

        await expect(linkAtLogin(42, async () => ['a@example.com'])).resolves.toBeUndefined();

        expect(savedTeams()).toEqual(['T2']);
    });

    it('never throws when the workspace query fails', async () => {
        mockDb.selectDistinct.mockImplementationOnce(() => {
            throw new Error('db down');
        });

        await expect(linkAtLogin(42, async () => ['a@example.com'])).resolves.toBeUndefined();
    });

    it('never throws when loading the emails fails', async () => {
        await expect(
            linkAtLogin(42, async () => {
                throw new Error('emails failed');
            }),
        ).resolves.toBeUndefined();

        expect(mockDb.selectDistinct).not.toHaveBeenCalled();
    });

    it('the time budget covers loading the emails', async () => {
        vi.useFakeTimers();
        workspaceRows.rows = [workspace('T1')];

        const done = linkAtLogin(42, () => new Promise(() => {}));
        await vi.advanceTimersByTimeAsync(LOGIN_LOOKUP_BUDGET_MS);
        await done;

        expect(mockDb.selectDistinct).not.toHaveBeenCalled();
        expect(mockLookupUserByEmail).not.toHaveBeenCalled();
    });

    it('login linking stops at the time budget', async () => {
        vi.useFakeTimers();
        workspaceRows.rows = [workspace('T1'), workspace('T2')];
        mockLookupUserByEmail.mockImplementation((token: string) =>
            token === 'token-T1' ? Promise.resolve('U1') : new Promise((resolve) => setTimeout(() => resolve('U2'), 5000)),
        );

        let finished = false;
        const done = linkAtLogin(42, async () => ['a@example.com']).then(() => {
            finished = true;
        });

        await vi.advanceTimersByTimeAsync(LOGIN_LOOKUP_BUDGET_MS - 1);
        expect(finished).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(finished).toBe(true);
        expect(savedTeams()).toEqual(['T1']);

        // The slow lookup completes after the budget: it must not write anything.
        await vi.advanceTimersByTimeAsync(5000);
        expect(mockLookupUserByEmail).toHaveBeenCalledTimes(2);
        expect(savedTeams()).toEqual(['T1']);
    });

    it('never logs or stores email addresses', async () => {
        workspaceRows.rows = [workspace('T1'), workspace('T2'), workspace('T3')];
        mockLookupUserByEmail.mockImplementation(async (token: string, email: string) => {
            if (token === 'token-T3') throw new Error(`lookup failed for ${email}`);
            return token === 'token-T1' ? 'U1' : null;
        });

        await linkAtLogin(42, async () => ['secret.person@example.com']);

        const logCalls = [
            ...mockLogger.debug.mock.calls,
            ...mockLogger.info.mock.calls,
            ...mockLogger.warn.mock.calls,
            ...mockLogger.error.mock.calls,
        ];
        expect(logCalls.length).toBeGreaterThan(0);
        expect(logCalls.some(containsEmail)).toBe(false);
        expect(mockSaveLookupResult).toHaveBeenCalledTimes(2);
        expect(mockSaveLookupResult.mock.calls.some(containsEmail)).toBe(false);
        expect(mockDb.insert).not.toHaveBeenCalled();
    });
});
