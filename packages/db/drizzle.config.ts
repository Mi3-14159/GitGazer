import {defineConfig} from 'drizzle-kit';
import {execSync} from 'node:child_process';
import {existsSync} from 'node:fs';

// Loaded here rather than via `node --env-file` because the drizzle-kit CLI evaluates this config itself.
// Absent files are ignored: the migrate script already gets its env from `node --env-file`.
const envFile = process.env.ENV_FILE ?? '.env';
if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

const host = process.env['RDS_HOST']!;
const hostname = process.env['RDS_HOSTNAME'] || host;
const database = process.env['RDS_DATABASE']!;
const port = Number(process.env['RDS_PORT']);
const user = process.env['RDS_DB_USER']!;

const password = execSync(`aws rds generate-db-auth-token --hostname ${hostname} --port 5432 --username ${user}`, {encoding: 'utf-8'}).trim();

export default defineConfig({
    out: './drizzle',
    schema: './src/schema/index.ts',
    schemaFilter: ['gitgazer', 'github'],
    dialect: 'postgresql',
    breakpoints: true,
    dbCredentials: {
        host,
        port,
        database,
        user,
        password,
        ssl: host === 'localhost' ? {rejectUnauthorized: false} : 'prefer',
    },
});
