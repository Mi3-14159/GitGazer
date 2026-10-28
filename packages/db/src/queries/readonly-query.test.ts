import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {afterAll, describe, expect, it} from 'vitest';
import {wrapReadOnlyQuery} from './readonlyQuery';

// PGlite.query() always speaks the extended protocol and PGlite.exec() the simple one, so these tests show what
// Postgres does with the wrapped query in each protocol, not which one node-postgres picks.
describe('wrapReadOnlyQuery against Postgres', () => {
    const client = new PGlite();
    const db = drizzle({client});

    afterAll(() => client.close());

    const stacked = 'SELECT 1) AS x; SELECT 2; SELECT * FROM (SELECT 1';

    it('is refused by Postgres when a statement is stacked into it', async () => {
        const error = await db.execute(wrapReadOnlyQuery(stacked, 10)).catch((e: unknown) => e);
        expect((error as {cause?: unknown}).cause).toMatchObject({
            message: expect.stringMatching(/cannot insert multiple commands into a prepared statement/),
        });
    });

    it('would run the stacked statements over the simple protocol', async () => {
        const results = await client.exec(`SELECT * FROM (\n${stacked}\n) AS _mcp LIMIT 11`);
        expect(results).toHaveLength(3);
    });
});
