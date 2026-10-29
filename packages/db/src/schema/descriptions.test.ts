import {PGlite} from '@electric-sql/pglite';
import {getTableSchema, isTable, isView, sql} from 'drizzle-orm';
import {pgSchema, text, uuid} from 'drizzle-orm/pg-core';
import {afterAll, beforeAll, describe as suite, expect, it} from 'vitest';
import {describe, descriptions, descriptionStatements} from './descriptions';
import {workflowRuns} from './github';
import * as schema from './index';

suite('descriptions', () => {
    it('describes every github table and every view', () => {
        const described = new Set(descriptions.map(({object}) => object));
        const missing = Object.entries(schema)
            .filter(([, value]) => (isTable(value) && getTableSchema(value) === 'github') || isView(value))
            .filter(([, value]) => !described.has(value as never))
            .map(([name]) => name);

        expect(missing).toEqual([]);
    });

    it('builds a statement for every described column, including the masked view columns', () => {
        const statements = descriptionStatements();

        expect(statements).toContain(
            `COMMENT ON COLUMN "gitgazer"."integration_app_github_settings_view"."secret" IS 'Webhook secret; NULL unless you are admin or owner of the integration.'`,
        );
        expect(statements.some((statement) => statement.startsWith('COMMENT ON VIEW "gitgazer"."users_view"'))).toBe(true);
        expect(statements.some((statement) => statement.startsWith('COMMENT ON TABLE "github"."user"'))).toBe(true);
    });

    it('keeps em dashes out of the database metadata', () => {
        expect(descriptions.flatMap(({text, columns}) => [text, ...Object.values(columns)]).filter((text) => text.includes('—'))).toEqual([]);
    });

    it('only accepts the keys of the described object', () => {
        // @ts-expect-error not a column of workflow_runs
        describe(workflowRuns, 'Runs.', {notAColumn: 'x'});
    });
});

suite('descriptionStatements on a database', () => {
    const testSchema = pgSchema('github');
    const things = testSchema.table('things', {integrationId: uuid('integration_id'), secretValue: text('secret_value')});
    const thingsView = testSchema
        .view('things_view')
        .as((qb) =>
            qb
                .select({integrationId: things.integrationId, secret: sql<string | null>`CASE WHEN true THEN ${things.secretValue} END`.as('secret')})
                .from(things),
        );
    const entries = [describe(things, "The owner's things."), describe(thingsView, 'Things, masked.', {secret: 'NULL unless allowed.'})];

    const pg = new PGlite();
    const createView = 'CREATE VIEW github.things_view AS SELECT integration_id, CASE WHEN true THEN secret_value END AS secret FROM github.things';
    const comments = async () =>
        (
            await pg.query<{tableText: string | null; viewText: string | null; columnText: string | null}>(`
                SELECT obj_description('github.things'::regclass, 'pg_class') AS "tableText",
                       obj_description('github.things_view'::regclass, 'pg_class') AS "viewText",
                       col_description('github.things_view'::regclass, 2) AS "columnText"
            `)
        ).rows[0];

    beforeAll(async () => {
        await pg.exec(`CREATE SCHEMA github; CREATE TABLE github.things (integration_id uuid, secret_value text); ${createView}`);
    });

    afterAll(async () => {
        await pg.close();
    });

    it('comments tables, views and aliased view columns', async () => {
        await pg.exec(descriptionStatements(entries).join(';\n'));

        expect(await comments()).toEqual({tableText: "The owner's things.", viewText: 'Things, masked.', columnText: 'NULL unless allowed.'});
    });

    it('restores the comments of a recreated view when applied again', async () => {
        await pg.exec(`DROP VIEW github.things_view; ${createView}`);
        expect((await comments())?.viewText).toBeNull();

        await pg.exec(descriptionStatements(entries).join(';\n'));

        expect(await comments()).toEqual({tableText: "The owner's things.", viewText: 'Things, masked.', columnText: 'NULL unless allowed.'});
    });
});
