import {config} from 'dotenv';
import {defineConfig} from 'drizzle-kit';

config({path: process.env.ENV_FILE});

export default defineConfig({
    out: './drizzle',
    schema: './src/drizzle/schema/index.ts',
    schemaFilter: ['gitgazer', 'github'],
    dialect: 'postgresql',
    driver: 'aws-data-api',
    breakpoints: true,
    dbCredentials: {
        database: process.env['RDS_DATABASE']!,
        secretArn: process.env['RDS_SECRET_ARN']!,
        resourceArn: process.env['RDS_RESOURCE_ARN']!,
    },
});
