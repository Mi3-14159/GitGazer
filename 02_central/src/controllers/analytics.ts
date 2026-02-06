import {getAthenaQueryExecution, runAthenaQuery} from '@/clients/athena';
import {isUserQuery, putUserQuery} from '@/clients/dynamodb';
import {getIamRoleArn} from '@/clients/iam';
import {getSignedUrl} from '@/clients/s3';
import {assumeRole} from '@/clients/sts';
import {ForbiddenError, InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {QueryResponse} from '@common/types/analytics';

export const executeQuery = async (params: {
    query: string;
    userId: string;
    integrationId: string;
    userIntegrations: string[];
}): Promise<QueryResponse> => {
    if (!params.userIntegrations.includes(params.integrationId)) {
        throw new ForbiddenError('You do not have access to this integration');
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
