import {config} from 'dotenv';
import {defineConfig} from 'drizzle-kit';
import {execSync} from 'node:child_process';

config({path: process.env.ENV_FILE});

const host = process.env['RDS_PROXY_ENDPOINT']!;
const hostname = process.env['RDS_PROXY_HOSTNAME'] || host;
const database = process.env['RDS_DATABASE']!;
const user = process.env['RDS_DB_USER']!;

const password = execSync(`aws rds generate-db-auth-token --hostname ${hostname} --port 5432 --username ${user}`, {encoding: 'utf-8'}).trim();

export default defineConfig({
    out: './drizzle',
    schema: '../../packages/db/src/schema/index.ts',
    schemaFilter: ['gitgazer', 'github'],
    dialect: 'postgresql',
    breakpoints: true,
    dbCredentials: {
        host,
        port: 5432,
        database,
        user,
        password,
        ssl: 'prefer',
    },
});
