import {PGlite, type Extension, type Transaction} from '@electric-sql/pglite';
import {PgDialect} from 'drizzle-orm/pg-core';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mcpTenantSeparationPolicy} from '../schema/github/misc';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

const readMigration = (folder: string) => readFileSync(join(__dirname, `../../drizzle/${folder}/migration.sql`), 'utf8');
const migration = readMigration('20261029090000_mcp_signed_context').replaceAll('--> statement-breakpoint', '');
// The views of the new migration need the real tables; they are tested separately.
const renameMigration = readMigration('20261029120000_role_aware_views')
    .split('--> statement-breakpoint')
    .filter((statement) => !/^\s*(?:CREATE VIEW|GRANT SELECT ON github\.)/.test(statement))
    .join('\n');
const policyUsing = new PgDialect().sqlToQuery(mcpTenantSeparationPolicy().using!).sql;
const mcpTables = [
    'enterprises',
    'integrations',
    'organizations',
    'pull_request_reviews',
    'pull_requests',
    'repositories',
    'user',
    'workflow_jobs',
    'workflow_run_pull_requests',
    'workflow_runs',
];

// A variable specifier, because only some of the tsconfigs that check this file resolve the package's exports map.
const PGCRYPTO = '@electric-sql/pglite/contrib/pgcrypto';

const signContext = `gitgazer.sign_context($1, pg_backend_pid(), (extract(epoch FROM now()) * 1000000)::bigint)`;

describe('signed mcp tenant context', () => {
    let db: PGlite;

    beforeAll(async () => {
        const {pgcrypto} = (await import(PGCRYPTO)) as {pgcrypto: Extension};
        db = new PGlite({extensions: {pgcrypto}});
        await db.exec(`
            CREATE EXTENSION pgcrypto;
            CREATE ROLE root SUPERUSER;
            CREATE ROLE gitgazer_mcp;
            CREATE ROLE gitgazer_reader;
            CREATE ROLE gitgazer_writer;
            SET ROLE root;
            CREATE SCHEMA github;
            CREATE SCHEMA gitgazer;
            GRANT USAGE ON SCHEMA gitgazer TO gitgazer_reader, gitgazer_writer;
            ALTER DEFAULT PRIVILEGES IN SCHEMA gitgazer GRANT SELECT ON TABLES TO gitgazer_reader, gitgazer_writer;
            GRANT USAGE ON SCHEMA github TO gitgazer_mcp, gitgazer_reader;
            GRANT USAGE ON SCHEMA gitgazer TO gitgazer_mcp;
            CREATE FUNCTION github.mcp_has_role(uuid, text) RETURNS boolean LANGUAGE sql AS 'SELECT FALSE';
            ${mcpTables
                .map(
                    (table) => `
                        CREATE TABLE github."${table}" (integration_id uuid);
                        CREATE POLICY "tenant separation mcp" ON github."${table}" FOR SELECT TO gitgazer_mcp USING (true);`,
                )
                .join('\n')}
        `);
        await db.exec(migration);
        await db.exec(renameMigration);
        await db.exec(`
            CREATE TABLE github.t (integration_id uuid, v int);
            ALTER TABLE github.t ENABLE ROW LEVEL SECURITY;
            CREATE POLICY "tenant separation mcp" ON github.t FOR SELECT TO gitgazer_mcp USING (${policyUsing});
            GRANT SELECT ON github.t TO gitgazer_mcp;
            INSERT INTO github.t VALUES ('${A}', 1), ('${B}', 2), ('${C}', 3);
            RESET ROLE;
        `);
    });

    afterAll(() => db.close());

    const setContext = async (tx: Transaction, context: string) => {
        await tx.query(`SELECT set_config('rls.signed_context', $1, true)`, [context]);
    };

    const sign = async (tx: Transaction, payload: string) => {
        const {rows} = await tx.query<{signature: string}>(`SELECT ${signContext} AS signature`, [payload]);
        return `${payload}|${rows[0].signature}`;
    };

    const selectAsMcp = async (tx: Transaction) => {
        await tx.exec('SET LOCAL ROLE gitgazer_mcp');
        const {rows} = await tx.query<{v: number}>('SELECT v FROM github.t ORDER BY v');
        return rows.map((row) => row.v);
    };

    const visible = (prepare: (tx: Transaction) => Promise<void>) =>
        db.transaction(async (tx) => {
            await tx.exec('SET LOCAL ROLE root');
            await prepare(tx);
            return selectAsMcp(tx);
        });

    it('keeps the existing mcp policies working after the rename', async () => {
        expect(await visible(async (tx) => setContext(tx, await sign(tx, `${A}:viewer`)))).toEqual([1]);
    });

    it('ignores the old setting name', async () => {
        const old = async (tx: Transaction) => {
            const context = await sign(tx, `${A}:viewer`);
            await tx.query(`SELECT set_config('rls.mcp_context', $1, true)`, [context]);
        };
        expect(await visible(old)).toEqual([]);
    });

    it('returns the rows of the signed integrations only', async () => {
        expect(await visible(async (tx) => setContext(tx, await sign(tx, `${A}:viewer,${B}:admin`)))).toEqual([1, 2]);
    });

    it('returns nothing when the payload is changed after signing', async () => {
        const changed = async (tx: Transaction) => {
            const context = await sign(tx, `${A}:viewer,${B}:admin`);
            await setContext(tx, context.replace(`${B}:admin`, `${B}:admin,${C}:viewer`));
        };
        expect(await visible(changed)).toEqual([]);
    });

    it('returns nothing when the signature is changed', async () => {
        const changed = async (tx: Transaction) => {
            const context = await sign(tx, `${A}:viewer`);
            const last = context.endsWith('0') ? '1' : '0';
            await setContext(tx, context.slice(0, -1) + last);
        };
        expect(await visible(changed)).toEqual([]);
    });

    it('returns nothing when the setting is unset', async () => {
        expect(await visible(async () => {})).toEqual([]);
    });

    it('returns nothing, without an error, for a malformed setting', async () => {
        for (const context of ['garbage', `${A}:viewer|zz`, `not-a-uuid:viewer|${'0'.repeat(64)}`, '|', '']) {
            expect(await visible(async (tx) => setContext(tx, context))).toEqual([]);
        }
    });

    it('returns nothing for a context signed in an earlier transaction', async () => {
        const context = await db.transaction(async (tx) => {
            await tx.exec('SET LOCAL ROLE root');
            return sign(tx, `${A}:viewer`);
        });
        // PGlite's now() has millisecond resolution, so make sure the next transaction starts later.
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(await visible(async (tx) => setContext(tx, context))).toEqual([]);
    });

    it('returns nothing for a context signed for another backend', async () => {
        const otherPid = async (tx: Transaction) => {
            const {rows} = await tx.query<{signature: string}>(
                `SELECT gitgazer.sign_context($1, pg_backend_pid() + 1, (extract(epoch FROM now()) * 1000000)::bigint) AS signature`,
                [`${A}:viewer`],
            );
            await setContext(tx, `${A}:viewer|${rows[0].signature}`);
        };
        expect(await visible(otherPid)).toEqual([]);
    });

    it('returns nothing, without an error, for a signed empty or malformed payload', async () => {
        for (const payload of ['', 'not-a-uuid:viewer', `${A}:viewer,`, `${A}:viewer|x`]) {
            expect(await visible(async (tx) => setContext(tx, await sign(tx, payload)))).toEqual([]);
        }
    });

    describe('github.integration_ids', () => {
        const ids = (minimumRole: string) =>
            db.transaction(async (tx) => {
                await tx.exec('SET LOCAL ROLE root');
                await setContext(tx, await sign(tx, `${A}:member,${B}:admin,${C}:owner`));
                await tx.exec('SET LOCAL ROLE gitgazer_mcp');
                const {rows} = await tx.query<{ids: string[]}>('SELECT github.integration_ids($1) AS ids', [minimumRole]);
                return rows[0].ids;
            });

        it('returns the integrations where the caller has at least the role', async () => {
            expect((await ids('admin')).sort()).toEqual([B, C]);
        });

        it('returns no integrations for an unknown role', async () => {
            expect(await ids('nonsense')).toEqual([]);
        });
    });

    describe('privileges', () => {
        const asRole = (role: string, statement: string) =>
            db.transaction(async (tx) => {
                await tx.exec(`SET LOCAL ROLE ${role}`);
                return tx.query(statement);
            });

        it('keeps the key from gitgazer_mcp', async () => {
            await expect(asRole('gitgazer_mcp', 'SELECT * FROM gitgazer.context_key')).rejects.toThrow(/permission denied for table context_key/);
        });

        it('keeps the sign function from gitgazer_mcp', async () => {
            await expect(asRole('gitgazer_mcp', `SELECT gitgazer.sign_context('x', 1, 1)`)).rejects.toThrow(
                /permission denied for function sign_context/,
            );
        });

        it.each(['gitgazer_reader', 'gitgazer_writer'])('keeps the key from %s', async (role) => {
            await expect(asRole(role, 'SELECT * FROM gitgazer.context_key')).rejects.toThrow(/permission denied for table context_key/);
        });

        // Predefined roles such as pg_read_all_data are skipped themselves, but any role granted one still shows up here
        it('leaves the key readable only by its owner and superusers', async () => {
            const {rows} = await db.query<{rolname: string}>(
                `SELECT rolname FROM pg_roles
                 WHERE NOT rolsuper AND rolname <> 'root' AND rolname NOT LIKE 'pg\\_%'
                   AND has_table_privilege(oid, 'gitgazer.context_key', 'SELECT')`,
            );
            expect(rows).toEqual([]);
        });

        it.each(['signed_context', 'integration_ids'])('keeps github.%s from gitgazer_reader', async (fn) => {
            await expect(asRole('gitgazer_reader', `SELECT github.${fn}()`)).rejects.toThrow(`permission denied for function ${fn}`);
        });

        it('keeps the sign function from gitgazer_reader', async () => {
            await expect(asRole('gitgazer_reader', `SELECT gitgazer.sign_context('x', 1, 1)`)).rejects.toThrow(
                /permission denied for function sign_context/,
            );
        });
    });

    it('verifies the context in an InitPlan, not per row', async () => {
        const plan = await db.transaction(async (tx) => {
            await tx.exec('SET LOCAL ROLE gitgazer_mcp');
            const {rows} = await tx.query<{'QUERY PLAN': string}>('EXPLAIN (COSTS OFF) SELECT * FROM github.t');
            return rows.map((row) => row['QUERY PLAN']).join('\n');
        });
        expect(plan).toContain('InitPlan');
    });

    it('updates the existing mcp policies', async () => {
        const {rows} = await db.query<{tablename: string; qual: string}>(
            `SELECT tablename, qual FROM pg_policies WHERE policyname = 'tenant separation mcp' AND tablename <> 't'`,
        );
        expect(rows.map((row) => row.tablename).sort()).toEqual(mcpTables);
        for (const row of rows) {
            expect(row.qual).toContain('github.integration_ids()');
        }
    });
});
