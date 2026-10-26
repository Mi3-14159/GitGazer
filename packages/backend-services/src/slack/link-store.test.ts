import type {SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
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
                    onConflictDoUpdate: (config: {set: unknown; setWhere?: SQL}) => {
                        upsertSet(config.set, config.setWhere);
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

const dialect = new PgDialect();

/** The condition under which the upsert may replace an existing row, rendered without the table prefix. */
const replaceCondition = (call: number) => {
    const setWhere = upsertSet.mock.calls[call][1] as SQL;
    const {sql, params} = dialect.sqlToQuery(setWhere);
    return {sql: sql.replaceAll('"gitgazer"."slack_user_links".', ''), params};
};

describe('link-store', () => {
    beforeEach(() => {
        selectResult.rows = [];
    });

    it('getLink returns null when there is no link', async () => {
        expect(await getLink('T1', 42)).toBeNull();
    });

    it('getLink returns the stored link', async () => {
        selectResult.rows = [{slackUserId: 'U1', source: 'gitgazer_email', checkedAt: earlier, autoLinkBlocked: false}];

        expect(await getLink('T1', 42)).toEqual({slackUserId: 'U1', source: 'gitgazer_email', checkedAt: earlier, autoLinkBlocked: false});
    });

    it('saveLookupResult stores a found link', async () => {
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: 'U1', source: 'gitgazer_email', now});

        expect(mockDb.select).not.toHaveBeenCalled();
        expect(insertValues).toHaveBeenCalledWith({teamId: 'T1', githubUserId: 42, slackUserId: 'U1', source: 'gitgazer_email', checkedAt: now});
        expect(upsertSet).toHaveBeenCalledWith({slackUserId: 'U1', source: 'gitgazer_email', checkedAt: now}, expect.anything());
    });

    it('saveLookupResult stores not found without a source', async () => {
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: null, source: 'gitgazer_email', now});

        expect(insertValues).toHaveBeenCalledWith({teamId: 'T1', githubUserId: 42, slackUserId: null, source: null, checkedAt: now});
        expect(upsertSet).toHaveBeenCalledWith({slackUserId: null, source: null, checkedAt: now}, expect.anything());
    });

    it('saveLookupResult never overwrites a slack_sign_in link', async () => {
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: 'U2', source: 'gitgazer_email', now});
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: null, source: 'gitgazer_email', now});

        expect(replaceCondition(0).sql).toContain(`"source" is distinct from 'slack_sign_in'`);
        expect(replaceCondition(1).sql).toContain(`"source" is distinct from 'slack_sign_in'`);
    });

    it('saveLookupResult is a no-op when blocked', async () => {
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: 'U2', source: 'gitgazer_email', now});
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: null, source: 'gitgazer_email', now});

        expect(replaceCondition(0).sql).toMatch(/^not "auto_link_blocked" and /);
        expect(replaceCondition(1).sql).toMatch(/^not "auto_link_blocked" and /);
    });

    it('a found link replaces any automatic link', async () => {
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: 'U2', source: 'gitgazer_email', now});

        expect(replaceCondition(0)).toEqual({sql: `not "auto_link_blocked" and "source" is distinct from 'slack_sign_in'`, params: []});
    });

    it('not found does not replace a found link from another source', async () => {
        await saveLookupResult({teamId: 'T1', githubUserId: 42, slackUserId: null, source: 'github_profile_email', now});

        expect(replaceCondition(0)).toEqual({
            sql: `not "auto_link_blocked" and "source" is distinct from 'slack_sign_in' and ("slack_user_id" is null or "source" = $1)`,
            params: ['github_profile_email'],
        });
    });

    it('saveSignInLink stores a slack_sign_in link and lifts the block', async () => {
        await saveSignInLink('T1', 42, 'U1', now);

        expect(upsertSet).toHaveBeenCalledWith({slackUserId: 'U1', source: 'slack_sign_in', autoLinkBlocked: false, checkedAt: now}, undefined);
    });

    it('blockAutoLink removes the link and blocks automatic linking', async () => {
        await blockAutoLink('T1', 42, now);

        expect(upsertSet).toHaveBeenCalledWith({slackUserId: null, source: null, autoLinkBlocked: true, checkedAt: now}, undefined);
    });
});
