import {Job, JobRequestParameters} from '@common/types';
import type {WorkflowJobEvent} from '@octokit/webhooks-types';
import {get} from 'aws-amplify/api';
import {ref} from 'vue';

export const useJobs = () => {
    const isLoadingJobs = ref(false);

    const getJobs = async (params?: JobRequestParameters) => {
        isLoadingJobs.value = true;

        const queryParams: Record<string, string> = {};
        Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams[key] = String(value);
            }
        });

        const restOperation = get({
            apiName: 'api',
            path: '/jobs',
            options: {
                queryParams,
            },
        });

        const {body} = await restOperation.response;
        const jobs = (await body.json()) as unknown as Job<WorkflowJobEvent>[];
        isLoadingJobs.value = false;

        return jobs;
    };

    return {
        getJobs,
        isLoadingJobs,
    };
};
