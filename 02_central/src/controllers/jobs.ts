import {getJobsBy, QueryResult} from '@/clients/dynamodb';
import {Job, ProjectionType, WorkflowEvent} from '@common/types';

export const getJobs = async (params: {
    integrationIds: string[];
    limit?: number;
    projection?: ProjectionType;
    exclusiveStartKeys?: {[key: string]: any}[];
}): Promise<QueryResult<Job<Partial<WorkflowEvent<any>>>>[]> => {
    const {integrationIds, limit, projection, exclusiveStartKeys} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const jobs = await getJobsBy({
        keys: integrationIds.map((id) => ({integrationId: id})),
        ...(limit && {limit: Math.min(limit, 100)}),
        projection,
        exclusiveStartKeys,
    });

    return jobs;
};
