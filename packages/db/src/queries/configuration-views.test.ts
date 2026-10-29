import {PGlite, type Extension} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

const readMigration = (folder: string) =>
    readFileSync(join(__dirname, `../../drizzle/${folder}/migration.sql`), 'utf8')
        .split('--> statement-breakpoint')
        .filter((statement) => !/^\s*(?:ALTER POLICY|DROP FUNCTION)/.test(statement))
        .join('\n');

// A variable specifier, because only some of the tsconfigs that check this file resolve the package's exports map.
const PGCRYPTO = '@electric-sql/pglite/contrib/pgcrypto';

// Stand-ins with the columns and types of the real tables; the views must not depend on their RLS.
const baseTables = `
    CREATE TABLE gitgazer.users (
        id bigint, cognito_id uuid, email varchar(255), name varchar(255), picture text,
        github_id bigint, github_login varchar(255), last_active_at timestamptz
    );
    CREATE TABLE github."user-assignments" (
        integration_id uuid, user_id bigint, role varchar(20), source varchar(20), created_at timestamptz
    );
    CREATE TABLE gitgazer.integration_apps (integration_id uuid, app_id uuid, type varchar(20), created_at timestamptz);
    CREATE TABLE gitgazer.integration_app_github_settings (
        integration_id uuid, app_id uuid, secret uuid, org_sync_default_role varchar(20)
    );
    CREATE TABLE gitgazer.slack_workspaces (
        team_id varchar(32), team_name varchar(255), bot_user_id varchar(32), bot_token_ciphertext text,
        installed_by bigint, installed_at timestamptz, disconnected_at timestamptz
    );
    CREATE TABLE gitgazer.integration_app_slack_settings (integration_id uuid, app_id uuid, team_id varchar(32));
    CREATE TABLE gitgazer.notification_handles (
        integration_id uuid, handle_id uuid, app_id uuid, name varchar(100), created_at timestamptz, updated_at timestamptz
    );
    CREATE TABLE gitgazer.webhook_handle_details (integration_id uuid, handle_id uuid, url text);
    CREATE TABLE gitgazer.slack_handle_details (
        integration_id uuid, handle_id uuid, channel_id varchar(32), channel_name varchar(255)
    );
    CREATE TABLE gitgazer.notification_rules (
        integration_id uuid, id uuid, label varchar(100), enabled boolean, ignore_dependabot boolean,
        include_log_details boolean, rule jsonb, created_at timestamptz, updated_at timestamptz
    );
    CREATE TABLE gitgazer.notification_rule_destinations (integration_id uuid, rule_id uuid, handle_id uuid);
    CREATE TABLE gitgazer.integration_invitations (
        integration_id uuid, id uuid, email varchar(255), role varchar(20), invited_by bigint, invitee_id bigint,
        invite_token uuid, status varchar(20), created_at timestamptz, expires_at timestamptz
    );
    CREATE TABLE gitgazer.event_log_entries (
        integration_id uuid, id uuid, category varchar(30), type varchar(20), title varchar(500), message text,
        metadata jsonb, read boolean, created_at timestamptz
    );
    CREATE TABLE gitgazer.ws_connections (
        integration_id uuid, connection_id text, user_id bigint, connected_at timestamptz, channel varchar(30)
    );
    CREATE TABLE gitgazer.slack_user_links (
        team_id varchar(32), github_user_id bigint, slack_user_id varchar(32), source varchar(30),
        checked_at timestamptz, auto_link_blocked boolean
    );
`;

const each = `FROM unnest(ARRAY['${A}', '${B}', '${C}']::uuid[]) AS i`;
const seed = `
    INSERT INTO gitgazer.users VALUES
        (1, gen_random_uuid(), 'u1@example.com', 'u1', 'p1', 101, 'u1', now()),
        (2, gen_random_uuid(), 'u2@example.com', 'u2', 'p2', 102, 'u2', now()),
        (3, gen_random_uuid(), 'u3@example.com', 'u3', 'p3', 103, 'u3', now());
    INSERT INTO github."user-assignments" VALUES
        ('${A}', 1, 'viewer', 'manual', now()), ('${B}', 2, 'viewer', 'manual', now()), ('${C}', 3, 'viewer', 'manual', now());
    INSERT INTO gitgazer.slack_workspaces VALUES
        ('T1', 'one', 'B1', 'ciphertext', 3, now(), NULL),
        ('T2', 'two', 'B2', 'ciphertext', 3, now(), NULL);
    INSERT INTO gitgazer.integration_app_slack_settings VALUES
        ('${A}', gen_random_uuid(), 'T1'), ('${B}', gen_random_uuid(), 'T1'), ('${C}', gen_random_uuid(), 'T2');
    INSERT INTO gitgazer.integration_apps SELECT i, gen_random_uuid(), 'github', now() ${each};
    INSERT INTO gitgazer.integration_app_github_settings SELECT i, gen_random_uuid(), gen_random_uuid(), 'viewer' ${each};
    INSERT INTO gitgazer.notification_handles SELECT i, gen_random_uuid(), gen_random_uuid(), 'handle', now(), now() ${each};
    INSERT INTO gitgazer.webhook_handle_details SELECT i, gen_random_uuid(), 'https://example.com/hook' ${each};
    INSERT INTO gitgazer.slack_handle_details SELECT i, gen_random_uuid(), 'C1', 'general' ${each};
    INSERT INTO gitgazer.notification_rules SELECT i, gen_random_uuid(), 'rule', true, false, true, '{}', now(), now() ${each};
    INSERT INTO gitgazer.notification_rule_destinations SELECT i, gen_random_uuid(), gen_random_uuid() ${each};
    INSERT INTO gitgazer.integration_invitations
        SELECT i, gen_random_uuid(), 'invitee@example.com', 'member', 1, 2, gen_random_uuid(), 'pending', now(), now() ${each};
    INSERT INTO gitgazer.event_log_entries SELECT i, gen_random_uuid(), 'notification', 'info', 'title', 'message', '{}', false, now() ${each};
`;

const viewerViews = [
    'integration_apps',
    'integration_app_github_settings',
    'integration_app_slack_settings',
    'notification_handles',
    'webhook_handle_details',
    'slack_handle_details',
    'notification_rules',
    'notification_rule_destinations',
    'event_log_entries',
    'user_assignments',
];
const allViews = [...viewerViews, 'integration_invitations', 'users', 'slack_workspaces'];

const viewColumns: Record<string, string[]> = {
    integration_apps: ['integration_id', 'app_id', 'type', 'created_at'],
    integration_app_github_settings: ['integration_id', 'app_id', 'secret', 'org_sync_default_role'],
    integration_app_slack_settings: ['integration_id', 'app_id', 'team_id'],
    notification_handles: ['integration_id', 'handle_id', 'app_id', 'name', 'created_at', 'updated_at'],
    webhook_handle_details: ['integration_id', 'handle_id', 'url'],
    slack_handle_details: ['integration_id', 'handle_id', 'channel_id', 'channel_name'],
    notification_rules: ['integration_id', 'id', 'label', 'enabled', 'ignore_dependabot', 'include_log_details', 'rule', 'created_at', 'updated_at'],
    notification_rule_destinations: ['integration_id', 'rule_id', 'handle_id'],
    integration_invitations: [
        'integration_id',
        'id',
        'email',
        'role',
        'invited_by',
        'invitee_id',
        'invite_token',
        'status',
        'created_at',
        'expires_at',
    ],
    event_log_entries: ['integration_id', 'id', 'category', 'type', 'title', 'message', 'metadata', 'read', 'created_at'],
    user_assignments: ['integration_id', 'user_id', 'role', 'source', 'created_at'],
    users: ['id', 'email', 'name', 'picture', 'github_login', 'last_active_at'],
    slack_workspaces: ['team_id', 'team_name', 'bot_user_id', 'installed_by', 'installed_at', 'disconnected_at'],
};

const signContext = `gitgazer.sign_context($1, pg_backend_pid(), (extract(epoch FROM now()) * 1000000)::bigint)`;

describe('role-aware configuration views', () => {
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
            GRANT USAGE ON SCHEMA github TO gitgazer_mcp;
        `);
        await db.exec(readMigration('20261029090000_mcp_signed_context'));
        await db.exec(baseTables);
        // The prod defaults from 20260310163205, which apply to views as well.
        await db.exec(`
            ALTER DEFAULT PRIVILEGES IN SCHEMA github GRANT SELECT ON TABLES TO gitgazer_reader;
            ALTER DEFAULT PRIVILEGES IN SCHEMA github GRANT SELECT ON TABLES TO gitgazer_writer;
        `);
        await db.exec(readMigration('20261029120000_role_aware_views'));
        await db.exec(seed);
        await db.exec('RESET ROLE');
    });

    afterAll(() => db.close());

    const withContext = <T>(context: (sign: (payload: string) => Promise<string>) => Promise<string | undefined>, statement: string) =>
        db.transaction(async (tx) => {
            await tx.exec('SET LOCAL ROLE root');
            const sign = async (payload: string) => {
                const {rows} = await tx.query<{signature: string}>(`SELECT ${signContext} AS signature`, [payload]);
                return `${payload}|${rows[0].signature}`;
            };
            const value = await context(sign);
            if (value !== undefined) {
                await tx.query(`SELECT set_config('rls.signed_context', $1, true)`, [value]);
            }
            await tx.exec('SET LOCAL ROLE gitgazer_mcp');
            return (await tx.query<T>(statement)).rows;
        });

    const asCaller = <T>(roles: string, statement: string) => withContext<T>((sign) => sign(roles), statement);

    const callerRoles = `${A}:admin,${B}:viewer`;

    it.each(viewerViews)('%s returns the rows of A and B only', async (view) => {
        const rows = await asCaller<{integration_id: string}>(callerRoles, `SELECT integration_id FROM github.${view}`);
        expect(rows.map((row) => row.integration_id).sort()).toEqual([A, B]);
    });

    const byIntegration = async (view: string, column: string) => {
        const rows = await asCaller<{integration_id: string; value: unknown}>(
            callerRoles,
            `SELECT integration_id, ${column} AS value FROM github.${view} ORDER BY integration_id`,
        );
        return rows.map((row) => [row.integration_id, row.value !== null]);
    };

    it('integration_app_github_settings.secret is set for A and NULL for B', async () => {
        expect(await byIntegration('integration_app_github_settings', 'secret')).toEqual([
            [A, true],
            [B, false],
        ]);
    });

    it('webhook_handle_details.url is set for A and NULL for B', async () => {
        expect(await byIntegration('webhook_handle_details', 'url')).toEqual([
            [A, true],
            [B, false],
        ]);
    });

    it('integration_invitations: rows only where the caller is member+, token and email only for admin+', async () => {
        const invitations = (roles: string) =>
            asCaller<{integration_id: string; invite_token: string | null; email: string | null}>(
                roles,
                'SELECT integration_id, invite_token, email FROM github.integration_invitations',
            );
        const asAdmin = await invitations(callerRoles);
        expect(asAdmin).toHaveLength(1);
        expect(asAdmin[0].integration_id).toBe(A);
        expect(asAdmin[0].invite_token).not.toBeNull();
        expect(asAdmin[0].email).toBe('invitee@example.com');
        expect(await invitations(`${A}:member`)).toEqual([{integration_id: A, invite_token: null, email: null}]);
    });

    it('users returns u1 and u2 only, email only for u1', async () => {
        const rows = await asCaller<{id: number; email: string | null}>(callerRoles, 'SELECT id, email FROM github.users ORDER BY id');
        expect(rows).toEqual([
            {id: 1, email: 'u1@example.com'},
            {id: 2, email: null},
        ]);
    });

    it('slack_workspaces returns T1 only, with installed_by NULL because u3 is in C only', async () => {
        const rows = await asCaller<{team_id: string; installed_by: number | null}>(
            callerRoles,
            'SELECT team_id, installed_by FROM github.slack_workspaces',
        );
        expect(rows).toEqual([{team_id: 'T1', installed_by: null}]);
    });

    it('slack_workspaces shows installed_by when the installer is visible', async () => {
        const rows = await asCaller<{team_id: string; installed_by: number | null}>(
            `${C}:viewer`,
            'SELECT team_id, installed_by FROM github.slack_workspaces',
        );
        expect(rows).toEqual([{team_id: 'T2', installed_by: 3}]);
    });

    it.each(allViews)('%s returns nothing for an unsigned or forged context', async (view) => {
        const statement = `SELECT * FROM github.${view}`;
        expect(await withContext(async () => undefined, statement)).toEqual([]);
        const forged = `${A}:owner,${B}:owner,${C}:owner|${'0'.repeat(64)}`;
        expect(await withContext(async () => forged, statement)).toEqual([]);
        const changed = async (sign: (payload: string) => Promise<string>) => (await sign(`${A}:viewer`)).replace(':viewer', ':owner');
        expect(await withContext(changed, statement)).toEqual([]);
    });

    it('every new view is security_barrier and not security_invoker', async () => {
        const {rows} = await db.query<{relname: string; reloptions: string[] | null}>(
            `SELECT c.relname, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'github' AND c.relkind = 'v' ORDER BY c.relname`,
        );
        expect(rows.map((row) => row.relname)).toEqual([...allViews].sort());
        for (const row of rows) {
            expect(row.reloptions, row.relname).toEqual(['security_barrier=true']);
        }
    });

    it('lists the views, and no gitgazer table, in information_schema for gitgazer_mcp', async () => {
        const rows = await db.transaction(async (tx) => {
            await tx.exec('SET LOCAL ROLE gitgazer_mcp');
            return (
                await tx.query<{table_schema: string; table_name: string; table_type: string}>(
                    `SELECT table_schema, table_name, table_type FROM information_schema.tables
                     WHERE table_schema IN ('github', 'gitgazer') ORDER BY table_name`,
                )
            ).rows;
        });
        expect(rows).toEqual([...allViews].sort().map((view) => ({table_schema: 'github', table_name: view, table_type: 'VIEW'})));
    });

    describe('privileges', () => {
        it('gives gitgazer_mcp no privilege on any gitgazer table and no USAGE on gitgazer', async () => {
            const {rows} = await db.query<{usage: boolean; tables: string[] | null}>(
                `SELECT has_schema_privilege('gitgazer_mcp', 'gitgazer', 'USAGE') AS usage,
                        (SELECT array_agg(c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'gitgazer' AND c.relkind IN ('r', 'v', 'm', 'p')
                           AND (has_table_privilege('gitgazer_mcp', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                                OR has_any_column_privilege('gitgazer_mcp', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))) AS tables`,
            );
            expect(rows).toEqual([{usage: false, tables: null}]);
        });

        it('gives gitgazer_mcp only SELECT on the views', async () => {
            const {rows} = await db.query<{relname: string; can_select: boolean; can_write: boolean}>(
                `SELECT c.relname,
                        has_table_privilege('gitgazer_mcp', c.oid, 'SELECT') AS can_select,
                        has_table_privilege('gitgazer_mcp', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS can_write
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'github' AND c.relkind = 'v'`,
            );
            expect(rows).toHaveLength(allViews.length);
            for (const row of rows) {
                expect(row, row.relname).toMatchObject({can_select: true, can_write: false});
            }
        });

        it('grants each view to gitgazer_mcp only, besides its owner', async () => {
            const {rows} = await db.query<{relname: string; grantees: string[]}>(
                `SELECT c.relname, array_agg(DISTINCT pg_get_userbyid(acl.grantee)::text) AS grantees
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) AS acl
                 WHERE n.nspname = 'github' AND c.relkind = 'v' AND acl.grantee <> c.relowner
                 GROUP BY c.relname ORDER BY c.relname`,
            );
            expect(rows).toEqual([...allViews].sort().map((view) => ({relname: view, grantees: ['gitgazer_mcp']})));
        });
    });

    it('exposes no column outside the spec', async () => {
        const {rows} = await db.query<{table_name: string; columns: string[]}>(
            `SELECT table_name, array_agg(column_name::text ORDER BY ordinal_position) AS columns
             FROM information_schema.columns WHERE table_schema = 'github' AND table_name = ANY ($1) GROUP BY table_name`,
            [allViews],
        );
        expect(Object.fromEntries(rows.map((row) => [row.table_name, row.columns]))).toEqual(viewColumns);
    });
});
