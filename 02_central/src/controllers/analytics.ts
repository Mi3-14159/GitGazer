import {getAthenaQueryExecution, runAthenaQuery} from '@/clients/athena';
import {isUserQuery, putUserQuery} from '@/clients/dynamodb';
import {getSignedUrl} from '@/clients/s3';
import {UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {QueryResponse} from '@common/types/analytics';

export const executeQuery = async (userId: string, query: string): Promise<QueryResponse> => {
    const queryExecutionId = await runAthenaQuery(query);
    await putUserQuery(userId, queryExecutionId);

    return {
        queryId: queryExecutionId,
        status: 'REQUESTED',
    };
};

export const getQueryExecution = async (userId: string, queryId: string): Promise<QueryResponse> => {
    const isUser = await isUserQuery(userId, queryId);
    if (!isUser) {
        throw new UnauthorizedError('You do not have access to this query result');
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
