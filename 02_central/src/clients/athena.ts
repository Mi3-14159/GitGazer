import {
    AthenaClient,
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    QueryExecutionState,
    StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';

import {getLogger} from '@/logger';

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

export const runAthenaQuery = async <T>(params: {query: string; mapRow: (row: AthenaRow) => T}): Promise<T[]> => {
    const logger = getLogger();
    const now = new Date();
    const startCommand = new StartQueryExecutionCommand({
        QueryString: params.query,
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

    logger.info('Starting Athena query', {workgroup: athenaWorkgroup, database: athenaDatabase, catalog: athenaCatalog, query: params.query});
    const startResponse = await client.send(startCommand);
    const queryExecutionId = startResponse.QueryExecutionId;

    if (!queryExecutionId) {
        throw new Error('Failed to start Athena query');
    }

    await waitForCompletion(queryExecutionId);
    const rows = await collectRows(queryExecutionId);
    return rows.map(params.mapRow);
};

const waitForCompletion = async (queryExecutionId: string): Promise<void> => {
    const logger = getLogger();

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        const execution = await client.send(new GetQueryExecutionCommand({QueryExecutionId: queryExecutionId}));
        const state = execution.QueryExecution?.Status?.State;

        if (state === QueryExecutionState.SUCCEEDED) {
            return;
        }

        if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
            const reason = execution.QueryExecution?.Status?.StateChangeReason;
            throw new Error(`Athena query ${queryExecutionId} failed: ${state}${reason ? ` - ${reason}` : ''}`);
        }

        await sleep(POLL_INTERVAL_MS);
    }

    logger.warn(`Athena query ${queryExecutionId} exceeded max poll attempts`);
    throw new Error(`Athena query ${queryExecutionId} did not complete within timeout`);
};

const collectRows = async (queryExecutionId: string): Promise<AthenaRow[]> => {
    let nextToken: string | undefined;
    let columnNames: string[] | undefined;
    const rows: AthenaRow[] = [];

    do {
        const result = await client.send(new GetQueryResultsCommand({QueryExecutionId: queryExecutionId, NextToken: nextToken}));
        const currentRows = result.ResultSet?.Rows ?? [];

        for (const row of currentRows) {
            const values: Array<{VarCharValue?: string}> = row.Data ?? [];

            if (!columnNames) {
                columnNames = values.map((value) => value.VarCharValue ?? '');
                continue;
            }

            const mapped: AthenaRow = {};
            columnNames.forEach((name, index) => {
                mapped[name] = values[index]?.VarCharValue ?? null;
            });
            rows.push(mapped);
        }

        nextToken = result.NextToken;
    } while (nextToken);

    return rows;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
