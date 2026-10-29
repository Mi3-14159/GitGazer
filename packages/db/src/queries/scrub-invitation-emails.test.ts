import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';

const migration = readFileSync(join(__dirname, '../../drizzle/20261029140000_scrub_invitation_emails/migration.sql'), 'utf8')
    .split('--> statement-breakpoint')
    .join('\n');

const insert = (id: number, title: string, message: string, metadata: object) =>
    `INSERT INTO gitgazer.event_log_entries VALUES (${id}, 'integration', '${title}', '${message}', '${JSON.stringify(metadata)}'::jsonb);`;

describe('scrub_invitation_emails migration', () => {
    let rows: Record<number, {message: string; metadata: Record<string, unknown>}>;

    beforeAll(async () => {
        const db = new PGlite();
        await db.exec(`
            CREATE SCHEMA gitgazer;
            CREATE TABLE gitgazer.event_log_entries (id int, category varchar(30), title varchar(500), message text, metadata jsonb);
            ${insert(1, 'Invitation created', 'Invitation created for a@example.com with role "member"', {targetEmail: 'a@example.com', role: 'member', invitationId: 'i1'})}
            ${insert(2, 'Invitation created', 'Invitation created for link-only', {invitationId: 'i2'})}
            ${insert(3, 'Invitation revoked', 'Invitation for b@example.com was revoked', {targetEmail: 'b@example.com', invitationId: 'i3'})}
            ${insert(4, 'Invitation resent', 'Invitation to c@example.com was resent', {targetEmail: 'c@example.com', invitationId: 'i4'})}
            ${insert(5, 'Member left', 'Dana left the integration', {targetUserId: 5})}
            ${insert(6, 'Member role changed', 'e@example.com role changed from "viewer" to "member"', {targetUserId: 6, role: 'member'})}
            ${insert(7, 'Member removed', 'f@example.com was removed from the integration', {targetUserId: 7})}
            ${insert(8, 'Member left', 'g@example.com left the integration', {targetUserId: 8})}
            ${insert(9, 'Invitation accepted', 'h@example.com accepted an invitation and joined with role "member"', {targetUserId: 9})}
        `);
        await db.exec(migration);
        const result = await db.query<{id: number; message: string; metadata: Record<string, unknown>}>('SELECT * FROM gitgazer.event_log_entries');
        rows = Object.fromEntries(result.rows.map((row) => [row.id, row]));
    });

    it('rewrites the invitation entries without the email', () => {
        expect(rows[1]).toMatchObject({message: 'Invitation created with role "member"', metadata: {role: 'member', invitationId: 'i1'}});
        expect(rows[2]).toMatchObject({message: 'Invitation created', metadata: {invitationId: 'i2'}});
        expect(rows[3]).toMatchObject({message: 'An invitation was revoked', metadata: {invitationId: 'i3'}});
        expect(rows[4]).toMatchObject({message: 'An invitation was resent', metadata: {invitationId: 'i4'}});
        for (const id of [1, 2, 3, 4]) expect(rows[id].metadata).not.toHaveProperty('targetEmail');
    });

    it('replaces a leading member email with the user id', () => {
        expect(rows[6].message).toBe('User 6 role changed from "viewer" to "member"');
        expect(rows[7].message).toBe('User 7 was removed from the integration');
        expect(rows[8].message).toBe('User 8 left the integration');
        expect(rows[9].message).toBe('User 9 accepted an invitation and joined with role "member"');
    });

    it('leaves entries whose message starts with a name untouched', () => {
        expect(rows[5]).toMatchObject({message: 'Dana left the integration', metadata: {targetUserId: 5}});
    });
});
