import * as schema from '@/drizzle/schema';
import {gitgazerUser} from '@/drizzle/schema';
import {RDSDataClient} from '@aws-sdk/client-rds-data';
import {sql} from 'drizzle-orm';
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

export type RdsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const withRlsTransaction = async <T>(integrationIds: string[], callback: (tx: RdsTransaction) => Promise<T>): Promise<T> => {
    return await db.transaction(async (tx) => {
        await tx.execute(sql`SET ROLE ${sql.identifier(gitgazerUser.name)};`);
        await tx.execute(sql.raw(`SET LOCAL rls.integration_ids = '${integrationIds.join(',')}';`));

        return await callback(tx);
    });
};
