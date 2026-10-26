import {beforeEach, describe, expect, it, vi} from 'vitest';

const {mockDb, selectResult, insertValues, upsertSet} = vi.hoisted(() => {
    const selectResult: {rows: unknown[]} = {rows: []};
    const insertValues = vi.fn();
    const upsertSet = vi.fn();
    const mockDb = {
        select: vi.fn(() => ({from: () => ({where: () => Promise.resolve(selectResult.rows)})})),
        insert: vi.fn(() => ({
            values: (values: unknown) => {
                insertValues(values);
                return {
                    onConflictDoUpdate: (config: {set: unknown}) => {
                        upsertSet(config.set);
                        return Promise.resolve();
                    },
                };
            },
        })),
    };
    return {mockDb, selectResult, insertValues, upsertSet};
});

vi.mock('@gitgazer/db/client', () => ({db: mockDb}));

import {blockAutoLink, getLink, saveLookupResult, saveSignInLink} from './link-store';

const now = new Date('2026-10-26T10:00:00Z');
const earlier = new Date('2026-10-20T10:00:00Z');

const existing = (row: Record<string, unknown>) => {
    selectResult.rows = [{slackUserId: null, source: null, checkedAt: earlier, autoLinkBlocked: false, ...row}];
};

describe('link-store', () => {
    beforeEach(() => {
        selectResult.rows = [];
    });

    it('getLink returns null when there is no link', async () => {
        expect(await getLink('T1', 42)).toBeNull();
    });

    it('getLink returns the stored link', async () => {
        existing({slackUserId: 'U1', source: 'gitgazer_email'});

        expect(await getLink('T1', 42)).toEqual({slackUserId: 'U1', source: 'gitgazer_email', checkedAt: earlier, autoLinkBlocked: false});
    });

    it('saveLookupResult stores a found link', async () => {
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: 'U1', source: 'gitgazer_email', now});

        expect(insertValues).toHaveBeenCalledWith({teamId: 'T1', githubUserId: 42, slackUserId: 'U1', source: 'gitgazer_email', checkedAt: now});
        expect(upsertSet).toHaveBeenCalledWith({slackUserId: 'U1', source: 'gitgazer_email', checkedAt: now});
    });

    it('saveLookupResult stores not found without a source', async () => {
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: null, source: 'gitgazer_email', now});

        expect(insertValues).toHaveBeenCalledWith({teamId: 'T1', githubUserId: 42, slackUserId: null, source: null, checkedAt: now});
    });

    it('saveLookupResult never overwrites a slack_sign_in link', async () => {
        existing({slackUserId: 'U1', source: 'slack_sign_in'});

        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: 'U2', source: 'gitgazer_email', now});
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: null, source: 'github_profile_email', now});

        expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('saveLookupResult is a no-op when blocked', async () => {
        existing({autoLinkBlocked: true});

        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: 'U2', source: 'gitgazer_email', now});

        expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('not found does not replace a found link from another source', async () => {
        existing({slackUserId: 'U1', source: 'github_profile_email'});

        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: null, source: 'gitgazer_email', now});

        expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('not found replaces a found link from the same source', async () => {
        existing({slackUserId: 'U1', source: 'gitgazer_email'});

        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: null, source: 'gitgazer_email', now});

        expect(upsertSet).toHaveBeenCalledWith({slackUserId: null, source: null, checkedAt: now});
    });

    it('a found link replaces a link from another automatic source', async () => {
        existing({slackUserId: 'U1', source: 'github_profile_email'});

        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: 'U2', source: 'gitgazer_email', now});

        expect(upsertSet).toHaveBeenCalledWith({slackUserId: 'U2', source: 'gitgazer_email', checkedAt: now});
    });

    it('saveSignInLink stores a slack_sign_in link and lifts the block', async () => {
        await saveSignInLink('T1', 42, 'U1', now);

        expect(upsertSet).toHaveBeenCalledWith({slackUserId: 'U1', source: 'slack_sign_in', autoLinkBlocked: false, checkedAt: now});
    });

    it('blockAutoLink removes the link and blocks automatic linking', async () => {
        await blockAutoLink('T1', 42, now);

        expect(upsertSet).toHaveBeenCalledWith({slackUserId: null, source: null, autoLinkBlocked: true, checkedAt: now});
    });
});
