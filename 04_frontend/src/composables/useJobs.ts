import {Job} from '@common/types';
import {WorkflowJobEvent} from '@octokit/webhooks-types';
import {get} from 'aws-amplify/api';
import {ref} from 'vue';

export const useJobs = () => {
    const isLoadingJobs = ref(false);

    const getJobs = async () => {
        isLoadingJobs.value = true;
        const restOperation = get({
            apiName: 'api',
            path: '/jobs',
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
