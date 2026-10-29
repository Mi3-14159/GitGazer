import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';

const migration = readFileSync(join(__dirname, '../../drizzle/20261029140000_scrub_invitation_emails/migration.sql'), 'utf8')
    .split('--> statement-breakpoint')
    .join('\n');

const insert = (id: number, title: string, message: string, metadata: object | null, category = 'integration') =>
    `INSERT INTO gitgazer.event_log_entries VALUES (${id}, '${category}', '${title}', '${message}', ${
        metadata === null ? 'NULL' : `'${JSON.stringify(metadata)}'::jsonb`
    });`;

describe('scrub_invitation_emails migration', () => {
    let rows: Record<number, {message: string; metadata: Record<string, unknown> | null}>;

    beforeAll(async () => {
        const db = new PGlite();
        await db.exec(`
            CREATE SCHEMA gitgazer;
            CREATE TABLE gitgazer.users (id bigint, github_login varchar(255));
            INSERT INTO gitgazer.users VALUES (6, 'octo6'), (8, NULL), (9, 'octo9');
            CREATE TABLE gitgazer.event_log_entries (id int, category varchar(30), title varchar(500), message text NOT NULL, metadata jsonb);
            ${insert(1, 'Invitation created', 'Invitation created for a@example.com with role "member"', {targetEmail: 'a@example.com', role: 'member', invitationId: 'i1'})}
            ${insert(2, 'Invitation created', 'Invitation created for link-only', {invitationId: 'i2'})}
            ${insert(3, 'Invitation revoked', 'Invitation for b@example.com was revoked', {targetEmail: 'b@example.com', invitationId: 'i3'})}
            ${insert(4, 'Invitation resent', 'Invitation to c@example.com was resent', {targetEmail: 'c@example.com', invitationId: 'i4'})}
            ${insert(5, 'Member left', 'Dana left the integration', {targetUserId: 5})}
            ${insert(6, 'Member role changed', 'e@example.com role changed from "viewer" to "member"', {targetUserId: 6, role: 'member'})}
            ${insert(7, 'Member removed', 'f@example.com was removed from the integration', {targetUserId: 7})}
            ${insert(8, 'Member left', 'g@example.com left the integration', {targetUserId: 8})}
            ${insert(9, 'Invitation accepted', 'h@example.com accepted an invitation and joined with role "member"', {targetUserId: 9})}
            ${insert(10, 'Invitation created', 'Invitation created for link-only with role "viewer"', {role: 'viewer', invitationId: 'i10'})}
            ${insert(11, 'Invitation created', 'Invitation created for x@example.com', null)}
            ${insert(12, 'Invitation created', 'Invitation created for y@example.com', {role: null, targetEmail: 'y@example.com'})}
            ${insert(13, 'Invitation revoked', 'Invitation for z@example.com was revoked', {targetEmail: 'z@example.com'}, 'other')}
            ${insert(14, 'Member left', 'i@example.com left the integration', {targetUserId: 'abc'})}
            ${insert(15, 'Member left', 'j@example.com left the integration', {targetUserId: null})}
            ${insert(16, 'Member left', 'k@example.com left the integration', null)}
            ${insert(17, 'Member left', 'l@example.com left the integration', {targetUserId: 6}, 'other')}
        `);
        await db.exec(migration);
        const result = await db.query<{id: number; message: string; metadata: Record<string, unknown> | null}>(
            'SELECT * FROM gitgazer.event_log_entries',
        );
        rows = Object.fromEntries(result.rows.map((row) => [row.id, row]));
    });

    it('rewrites the invitation entries without the email', () => {
        expect(rows[1]).toMatchObject({message: 'Invitation created with role "member"', metadata: {role: 'member', invitationId: 'i1'}});
        expect(rows[2]).toMatchObject({message: 'Invitation created', metadata: {invitationId: 'i2'}});
        expect(rows[3]).toMatchObject({message: 'An invitation was revoked', metadata: {invitationId: 'i3'}});
        expect(rows[4]).toMatchObject({message: 'An invitation was resent', metadata: {invitationId: 'i4'}});
        expect(rows[10]).toMatchObject({message: 'Invitation created with role "viewer"', metadata: {role: 'viewer', invitationId: 'i10'}});
        for (const id of [1, 2, 3, 4, 10, 12]) expect(rows[id].metadata).not.toHaveProperty('targetEmail');
    });

    it('survives NULL metadata and a JSON-null role', () => {
        expect(rows[11]).toMatchObject({message: 'Invitation created', metadata: null});
        expect(rows[12].message).toBe('Invitation created');
    });

    it('names a member by GitHub login, then by id, then generically', () => {
        expect(rows[6].message).toBe('octo6 role changed from "viewer" to "member"');
        expect(rows[9].message).toBe('octo9 accepted an invitation and joined with role "member"');
        expect(rows[7].message).toBe('User 7 was removed from the integration');
        expect(rows[8].message).toBe('User 8 left the integration');
        expect(rows[14].message).toBe('User abc left the integration');
        expect(rows[15].message).toBe('A member left the integration');
        expect(rows[16].message).toBe('A member left the integration');
    });

    it('leaves names and other categories untouched', () => {
        expect(rows[5]).toMatchObject({message: 'Dana left the integration', metadata: {targetUserId: 5}});
        expect(rows[13]).toMatchObject({message: 'Invitation for z@example.com was revoked', metadata: {targetEmail: 'z@example.com'}});
        expect(rows[17].message).toBe('l@example.com left the integration');
    });
});
