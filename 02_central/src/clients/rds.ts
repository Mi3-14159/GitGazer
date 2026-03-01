import * as schema from '@/drizzle/schema';
import {RDSDataClient} from '@aws-sdk/client-rds-data';
import {drizzle} from 'drizzle-orm/aws-data-api/pg';

const rdsClient = new RDSDataClient({});

if (!process.env['RDS_DATABASE'] || !process.env['RDS_SECRET_ARN'] || !process.env['RDS_RESOURCE_ARN']) {
    throw new Error('Missing required environment variables for RDS connection');
}

export const db = drizzle(rdsClient, {
    database: process.env['RDS_DATABASE']!,
    secretArn: process.env['RDS_SECRET_ARN']!,
    resourceArn: process.env['RDS_RESOURCE_ARN']!,
    schema,
});
