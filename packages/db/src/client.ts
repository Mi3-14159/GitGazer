import {RDSDataClient} from '@aws-sdk/client-rds-data';
import {sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/aws-data-api/pg';
import * as schema from './schema';
import {gitgazerReader} from './schema';

const rdsClient = new RDSDataClient({});

if (!process.env['RDS_DATABASE'] || !process.env['RDS_SECRET_ARN'] || !process.env['RDS_RESOURCE_ARN']) {
    throw new Error('Missing required environment variables for RDS connection');
}

export const db = drizzle(rdsClient, {
    database: process.env['RDS_DATABASE']!,
    secretArn: process.env['RDS_SECRET_ARN']!,
    resourceArn: process.env['RDS_RESOURCE_ARN']!,
    schema,
    logger: true,
});

export type RdsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const INTEGRATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const withRlsTransaction = async <T>(params: {
    integrationIds: string[];
    userName?: string;
    callback: (tx: RdsTransaction) => Promise<T>;
}): Promise<T> => {
    const {integrationIds, userName = gitgazerReader.name, callback} = params;

    // Validate integration IDs to prevent SQL injection via the raw SET LOCAL
    for (const id of integrationIds) {
        if (!INTEGRATION_ID_PATTERN.test(id)) {
            throw new Error(`Invalid integration ID: ${id}`);
        }
    }

    return await db.transaction(async (tx) => {
        await tx.execute(sql`SET ROLE ${sql.identifier(userName)};`);
        await tx.execute(sql.raw(`SET LOCAL rls.integration_ids = '${integrationIds.join(',')}';`));

        return await callback(tx);
    });
};
