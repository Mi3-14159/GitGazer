import {InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {Column, GetTableCommand, GlueClient} from '@aws-sdk/client-glue';

const glue = new GlueClient();

export const fetchTableSchema = async (catalogId: string, databaseName: string, tableName: string): Promise<Column[]> => {
    const command = new GetTableCommand({
        CatalogId: catalogId,
        DatabaseName: databaseName,
        Name: tableName,
    });
    const {Table} = await glue.send(command);
    if (!Table) {
        throw new InternalServerError(`Table ${databaseName}.${tableName} not found in Glue Catalog`);
    }

    const {Columns} = Table.StorageDescriptor ?? {};
    if (!Columns) {
        throw new InternalServerError(`No columns found for table ${databaseName}.${tableName}`);
    }

    return Columns;
};
