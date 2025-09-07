import {Job} from '@common/types';
import {WorkflowJobEvent} from '@octokit/webhooks-types';
import {get} from 'aws-amplify/api';

export const useJobs = () => {
    const getJobs = async () => {
        const restOperation = get({
            apiName: 'api',
            path: '/jobs',
        });

        const {body} = await restOperation.response;
        return (await body.json()) as unknown as Job<WorkflowJobEvent>[];
    };

    return {
        getJobs,
    };
};
