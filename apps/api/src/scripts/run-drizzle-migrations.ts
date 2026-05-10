import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import pg from 'pg';
import drizzleConfig from '../../drizzle.config';

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

    const db = drizzle(pool);
    const migrationsFolder = path.resolve(__dirname, '../../', config.out ?? './drizzle');

    try {
        console.info(`Running Drizzle migrations from: ${migrationsFolder}`);
        await migrate(db, {migrationsFolder});
        console.info('Drizzle migrations completed successfully.');
    } finally {
        await pool.end();
    }
}

run().catch((error) => {
    console.error('Manual Drizzle migration failed.');
    console.error(error);
    process.exitCode = 1;
});
