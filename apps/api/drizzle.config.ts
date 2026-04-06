import {execFileSync} from 'child_process';
import {config} from 'dotenv';
import {defineConfig} from 'drizzle-kit';

config({path: process.env.ENV_FILE});

const proxyEndpoint = process.env['RDS_PROXY_ENDPOINT']!;
const proxyHostname = process.env['RDS_PROXY_HOSTNAME'] || proxyEndpoint;
const dbUser = process.env['RDS_DB_USER']!;

// drizzle-kit loads config as CJS (no top-level await), so generate the IAM token via a child process.
// Uses execFileSync (no shell) with env vars to avoid command injection via string interpolation.
const token = execFileSync(
    'node',
    [
        '-e',
        'const{Signer}=require("@aws-sdk/rds-signer");new Signer({hostname:process.env._HOST,port:5432,username:process.env._USER}).getAuthToken().then(t=>process.stdout.write(t))',
    ],
    {
        encoding: 'utf-8',
        env: {
            ...process.env,
            _HOST: proxyHostname,
            _USER: dbUser,
        },
    },
);

export default defineConfig({
    out: './drizzle',
    schema: '../../packages/db/src/schema/index.ts',
    schemaFilter: ['gitgazer', 'github'],
    dialect: 'postgresql',
    breakpoints: true,
    dbCredentials: {
        host: proxyEndpoint,
        port: 5432,
        database: process.env['RDS_DATABASE']!,
        user: dbUser,
        password: token,
        ssl: 'prefer',
    },
});
