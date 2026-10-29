import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import pg from 'pg';
import drizzleConfig from '../drizzle.config';
import {descriptionStatements} from '../src/schema/descriptions';

type PgCredentials = {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: pg.PoolConfig['ssl'] | 'prefer';
};

type DrizzleConfigWithCredentials = {
    out?: string;
    dbCredentials?: PgCredentials;
};

async function run(): Promise<void> {
    const config = drizzleConfig as DrizzleConfigWithCredentials;
    const credentials = config.dbCredentials;
    if (!credentials) {
        throw new Error('Missing dbCredentials in drizzle.config.ts');
    }

    const ssl = credentials.ssl === 'prefer' ? {rejectUnauthorized: false} : credentials.ssl;

    const pool = new pg.Pool({
        host: credentials.host,
        port: credentials.port,
        database: credentials.database,
        user: credentials.user,
        password: credentials.password,
        ssl,
    });

    const db = drizzle({client: pool});
    const migrationsFolder = path.resolve(__dirname, '../', config.out ?? './drizzle');

    try {
        console.info(`Running Drizzle migrations from: ${migrationsFolder}`);
        await migrate(db, {migrationsFolder});
        console.info('Drizzle migrations completed successfully.');

        // Re-applied on every run: drizzle-kit rebuilds a changed view with DROP + CREATE, which drops its comments.
        // One simple-query message runs as a single implicit transaction.
        const statements = descriptionStatements();
        await pool.query(statements.join(';\n'));
        console.info(`Applied ${statements.length} table and column descriptions.`);
    } finally {
        await pool.end();
    }
}

run().catch((error) => {
    console.error('Manual Drizzle migration failed.');
    console.error(error);
    process.exitCode = 1;
});
