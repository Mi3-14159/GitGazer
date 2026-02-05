import {
    AthenaClient,
    GetQueryExecutionCommand,
    GetQueryExecutionCommandOutput,
    QueryExecutionState,
    StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';

import {getLogger} from '@/logger';
import {InternalServerError} from '@aws-lambda-powertools/event-handler/http';

const client = new AthenaClient({});

const athenaWorkgroup = process.env.ATHENA_WORKGROUP;
if (!athenaWorkgroup) {
    throw new Error('ATHENA_WORKGROUP environment variable is not set');
}

const athenaDatabase = process.env.ATHENA_DATABASE;
if (!athenaDatabase) {
    throw new Error('ATHENA_DATABASE environment variable is not set');
}

const athenaCatalog = process.env.ATHENA_CATALOG;
if (!athenaCatalog) {
    throw new Error('ATHENA_CATALOG environment variable is not set');
}

const athenaQueryResultsS3Bucket = process.env.ATHENA_QUERY_RESULT_S3_BUCKET;
if (!athenaQueryResultsS3Bucket) {
    throw new Error('ATHENA_QUERY_RESULT_S3_BUCKET environment variable is not set');
}

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 60;
const MAX_QUERY_RESULTS_AGE_MINUTES = 15;

export type AthenaRow = Record<string, string | null>;

export const runAthenaQuery = async (query: string): Promise<string> => {
    const logger = getLogger();
    const now = new Date();
    const startCommand = new StartQueryExecutionCommand({
        QueryString: query,
        WorkGroup: athenaWorkgroup,
        QueryExecutionContext: {
            Database: athenaDatabase,
            Catalog: athenaCatalog,
        },
        ResultConfiguration: {
            OutputLocation: `s3://${athenaQueryResultsS3Bucket}/${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}/`,
            AclConfiguration: {
                S3AclOption: 'BUCKET_OWNER_FULL_CONTROL',
            },
        },
        ResultReuseConfiguration: {
            ResultReuseByAgeConfiguration: {
                Enabled: true,
                MaxAgeInMinutes: MAX_QUERY_RESULTS_AGE_MINUTES,
            },
        },
    });

    logger.debug('Starting Athena query', {startCommand});
    const startResponse = await client.send(startCommand);
    const queryExecutionId = startResponse.QueryExecutionId;

    if (!queryExecutionId) {
        throw new InternalServerError('Failed to start Athena query, no QueryExecutionId returned');
    }

    return queryExecutionId;
};

export const getAthenaQueryExecution = async (queryExecutionId: string): Promise<GetQueryExecutionCommandOutput> => {
    return await client.send(new GetQueryExecutionCommand({QueryExecutionId: queryExecutionId}));
};

export const waitForCompletion = async (queryExecutionId: string): Promise<GetQueryExecutionCommandOutput> => {
    const logger = getLogger();

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        const execution = await client.send(new GetQueryExecutionCommand({QueryExecutionId: queryExecutionId}));
        const state = execution.QueryExecution?.Status?.State;

        if (state === QueryExecutionState.SUCCEEDED) {
            return execution;
        }

        if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
            const reason = execution.QueryExecution?.Status?.StateChangeReason;
            throw new InternalServerError(`Athena query ${queryExecutionId} failed: ${state}${reason ? ` - ${reason}` : ''}`);
        }

        await sleep(POLL_INTERVAL_MS);
    }

    logger.warn(`Athena query ${queryExecutionId} exceeded max poll attempts`);
    throw new InternalServerError(`Athena query ${queryExecutionId} did not complete within timeout`);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
