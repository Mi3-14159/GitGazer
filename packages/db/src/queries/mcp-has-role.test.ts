import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

const migration = readFileSync(join(__dirname, '../../drizzle/20261028120000_mcp_has_role/migration.sql'), 'utf8');

describe('github.mcp_has_role', () => {
    let db: PGlite;

    beforeAll(async () => {
        db = new PGlite();
        await db.exec('CREATE ROLE gitgazer_mcp; CREATE SCHEMA github;');
        await db.exec(migration.replaceAll('--> statement-breakpoint', ''));
    });

    afterAll(() => db.close());

    const hasRole = async (integrationId: string, role: string, roles?: string) =>
        db.transaction(async (tx) => {
            if (roles !== undefined) {
                await tx.exec(`SET LOCAL rls.integration_roles = '${roles}'`);
            }
            const {rows} = await tx.query<{result: boolean}>('SELECT github.mcp_has_role($1, $2) AS result', [integrationId, role]);
            return rows[0].result;
        });

    const roles = `${A}:admin,${B}:viewer`;

    it.each([
        [A, 'member', true],
        [A, 'owner', false],
        [B, 'viewer', true],
        [B, 'member', false],
        [C, 'viewer', false],
        [A, 'superuser', false],
    ])('integration %s, minimum role %s -> %s', async (integrationId, role, expected) => {
        expect(await hasRole(integrationId, role, roles)).toBe(expected);
    });

    it('is false when the setting is unset', async () => {
        expect(await hasRole(A, 'viewer')).toBe(false);
    });
});
