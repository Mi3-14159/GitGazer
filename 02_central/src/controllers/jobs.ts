import {getJobsBy} from '@/clients/dynamodb';
import {Job, ProjectionType} from '@common/types';
import {WorkflowJobEvent} from '@octokit/webhooks-types';

export const getJobs = async (params: {
    integrationIds: string[];
    limit?: number;
    projection?: ProjectionType;
}): Promise<Job<Partial<WorkflowJobEvent>>[]> => {
    const {integrationIds, limit, projection} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const jobs = await getJobsBy({
        keys: integrationIds.map((id) => ({integrationId: id})),
        ...(limit && {limit: Math.min(limit, 100)}),
        projection,
    });

    return jobs;
};
