import {getLogger} from '@/logger';
import {InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {
    CreateDataCellsFilterCommand,
    CreateDataCellsFilterCommandInput,
    DeleteDataCellsFilterCommand,
    DeleteDataCellsFilterCommandInput,
    GrantPermissionsCommand,
    GrantPermissionsCommandInput,
    LakeFormationClient,
    RevokePermissionsCommand,
    RevokePermissionsCommandInput,
} from '@aws-sdk/client-lakeformation';

const tableName = process.env.ATHENA_JOBS_TABLE;
if (!tableName) {
    throw new Error('ATHENA_JOBS_TABLE environment variable is not set');
}

const databaseName = process.env.ATHENA_DATABASE;
if (!databaseName) {
    throw new Error('ATHENA_DATABASE environment variable is not set');
}

const catalogId = process.env.LAKEFORMATION_CATALOG_ID;
if (!catalogId) {
    throw new Error('LAKEFORMATION_CATALOG_ID environment variable is not set');
}

const environment = process.env.ENVIRONMENT;
if (!environment) {
    throw new Error('ENVIRONMENT environment variable is not set');
}

const client = new LakeFormationClient();

export const grantLakeFormationPermissions = async (params: {roleArn: string; integrationId: string}): Promise<void> => {
    const logger = getLogger();
    logger.info(`Granting Lake Formation permissions to role ${params.roleArn} for table ${catalogId}.${databaseName}.${tableName}`);

    const input = getInput(params.roleArn, params.integrationId);
    const command = new GrantPermissionsCommand(input);

    const maxAttempts = 10;
    const retryIntervalMs = 1500;

    return new Promise((resolve, reject) => {
        let attempt = 0;

        const intervalId = setInterval(async () => {
            attempt++;

            try {
                await client.send(command);
                clearInterval(intervalId);
                logger.info(`Successfully granted Lake Formation permissions to role ${params.roleArn} after ${attempt} attempt(s)`);
                resolve();
            } catch (error) {
                logger.debug(`Error granting Lake Formation permissions on attempt ${attempt}/${maxAttempts}`, {attempt, params, error});

                if (attempt >= maxAttempts) {
                    clearInterval(intervalId);
                    logger.error(`Failed to grant Lake Formation permissions after ${maxAttempts} attempts`, {error});
                    reject(new InternalServerError('Failed to grant Lake Formation permissions'));
                }
            }
        }, retryIntervalMs);
    });
};

export const revokeLakeFormationPermissions = async (params: {roleArn: string; integrationId: string}): Promise<void> => {
    const logger = getLogger();
    logger.info(`Revoking Lake Formation permissions from role ${params.roleArn} for table ${catalogId}.${databaseName}.${tableName}`);

    const input = getInput(params.roleArn, params.integrationId);
    const command = new RevokePermissionsCommand(input);
    await client.send(command);
};

const getInput = (roleArn: string, integrationId: string): GrantPermissionsCommandInput | RevokePermissionsCommandInput => {
    const command: GrantPermissionsCommandInput | RevokePermissionsCommandInput = {
        Principal: {
            DataLakePrincipalIdentifier: roleArn,
        },
        Resource: {
            DataCellsFilter: {
                TableCatalogId: catalogId,
                DatabaseName: databaseName,
                TableName: tableName,
                Name: getDataCellsFilterName(integrationId),
            },
        },
        Permissions: ['SELECT'],
    };

    return command;
};

const getDataCellsFilterName = (integrationId: string) => `gitgazer-${integrationId}`;

export const createDataFilter = async (params: {integrationId: string}): Promise<void> => {
    const logger = getLogger();
    logger.info(`Creating Lake Formation data filter for integration ${params.integrationId} on table ${catalogId}.${databaseName}.${tableName}`);

    const input: CreateDataCellsFilterCommandInput = {
        TableData: {
            Name: getDataCellsFilterName(params.integrationId),
            TableCatalogId: catalogId,
            DatabaseName: databaseName,
            TableName: tableName,
            RowFilter: {
                FilterExpression: `integrationId = '${params.integrationId}'`,
            },
            ColumnWildcard: {},
        },
    };

    const command = new CreateDataCellsFilterCommand(input);
    await client.send(command);
};

export const deleteDataFilter = async (params: {integrationId: string}): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deleting Lake Formation data filter for integration ${params.integrationId} on table ${catalogId}.${databaseName}.${tableName}`);

    const input: DeleteDataCellsFilterCommandInput = {
        Name: getDataCellsFilterName(params.integrationId),
        TableCatalogId: catalogId,
        DatabaseName: databaseName,
        TableName: tableName,
    };

    const command = new DeleteDataCellsFilterCommand(input);
    await client.send(command);
};
