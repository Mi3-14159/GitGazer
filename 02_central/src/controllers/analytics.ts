import {getAthenaQueryExecution, runAthenaQuery} from '@/clients/athena';
import {isUserQuery, putUserQuery} from '@/clients/dynamodb';
import {fetchTableSchema} from '@/clients/glue';
import {getIamRoleArn} from '@/clients/iam';
import {getSignedUrl} from '@/clients/s3';
import {assumeRole} from '@/clients/sts';
import {getLogger} from '@/logger';
import {ForbiddenError, InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {QueryResponse, TableSchema, TableSchemaField} from '@common/types/analytics';

const catalogId = process.env.LAKEFORMATION_CATALOG_ID;
if (!catalogId) {
    throw new Error('LAKEFORMATION_CATALOG_ID environment variable is not set');
}

const tableName = process.env.ATHENA_JOBS_TABLE;
if (!tableName) {
    throw new Error('ATHENA_JOBS_TABLE environment variable is not set');
}

const athenaDatabase = process.env.ATHENA_DATABASE;
if (!athenaDatabase) {
    throw new Error('ATHENA_DATABASE environment variable is not set');
}

export const executeQuery = async (params: {
    query: string;
    userId: string;
    integrationId: string;
    userIntegrations: string[];
}): Promise<QueryResponse> => {
    if (!params.userIntegrations.includes(params.integrationId)) {
        throw new ForbiddenError('You do not have access to this integration');
    }

    const firstWord = params.query.trim().toLowerCase().split(/\s+/)[0];
    if (firstWord !== 'select') {
        throw new ForbiddenError('Only SELECT queries are allowed');
    }

    const iamRoleArn = getIamRoleArn(params.integrationId);
    const assumedRole = await assumeRole(iamRoleArn);
    if (!assumedRole.Credentials) {
        throw new InternalServerError(`Failed to assume role for integration ${params.integrationId}`);
    }

    const queryExecutionId = await runAthenaQuery(params.query, assumedRole.Credentials);
    await putUserQuery(params.userId, queryExecutionId);

    return {
        queryId: queryExecutionId,
        status: 'REQUESTED',
    };
};

export const getQueryExecution = async (userId: string, queryId: string): Promise<QueryResponse> => {
    const isUser = await isUserQuery(userId, queryId);
    if (!isUser) {
        throw new ForbiddenError('You do not have access to this query result');
    }

    const execution = await getAthenaQueryExecution(queryId);
    const response: QueryResponse = {
        queryId,
        status: execution.QueryExecution?.Status?.State,
    };

    const {OutputLocation} = execution.QueryExecution?.ResultConfiguration || {};
    if (!OutputLocation) {
        return response;
    }

    const url = new URL(OutputLocation);
    const bucket = url.hostname;
    const key = url.pathname.slice(1); // Remove leading '/'

    response.resultsUrl = await getSignedUrl({bucket, key});

    return response;
};

export const getSchema = async (): Promise<TableSchema> => {
    const logger = getLogger();
    logger.info('Fetching table schema from Glue');

    const columns = await fetchTableSchema(catalogId, athenaDatabase, tableName);
    const tableSchema: TableSchema = {
        namespace: athenaDatabase,
        table: tableName,
        fields: columns.map((col) => {
            const field: TableSchemaField = {
                name: col.Name!,
                type: col.Type!,
                comment: col.Comment,
            };
            return field;
        }),
    };

    return tableSchema;
};
