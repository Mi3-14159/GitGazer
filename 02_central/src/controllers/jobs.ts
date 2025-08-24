import {getJobsBy} from '@/clients/dynamodb';
import {Job} from '@/types';

export const getJobs = async (params: {integrationIds: string[]; limit?: number}): Promise<Job[]> => {
    const {integrationIds} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const jobs = await getJobsBy({
        integrationIds,
    });

    return jobs;
};
