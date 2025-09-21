import {getJobsBy} from '@/clients/dynamodb';
import {Job, JobRequestParametersOffset, ProjectionType} from '@common/types';
import {WorkflowJobEvent} from '@octokit/webhooks-types';

export const getJobs = async (params: {
    integrationIds: string[];
    limit?: number;
    projection?: ProjectionType;
    offset?: JobRequestParametersOffset[];
}): Promise<Job<Partial<WorkflowJobEvent>>[]> => {
    const {integrationIds, limit, projection, offset} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const jobs = await getJobsBy({
        queryInput: integrationIds.map((integrationId) => ({
            integrationId,
            exclusiveStartKeys: offset?.find((o) => o.integrationId === integrationId),
        })),
        ...(limit && {limit: Math.min(limit, 100)}),
        projection,
    });

    return jobs;
};
