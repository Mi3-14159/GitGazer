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
            ${insert(5, 'Member left', 'd@example.com left the integration', {targetUserId: 5})}
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

    it('leaves other entries untouched', () => {
        expect(rows[5]).toMatchObject({message: 'd@example.com left the integration', metadata: {targetUserId: 5}});
    });
});
