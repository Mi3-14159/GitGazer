import {Job} from '@common/types';
import {WorkflowJobEvent} from '@octokit/webhooks-types';
import {get} from 'aws-amplify/api';
import {fetchAuthSession} from 'aws-amplify/auth';

export const useJobs = () => {
    const getJobs = async () => {
        const session = await fetchAuthSession();
        const authToken = session.tokens?.idToken;

        const restOperation = get({
            apiName: 'api',
            path: '/jobs',
            options: {
                withCredentials: true,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            },
        });

        const {body} = await restOperation.response;
        return (await body.json()) as unknown as Job<WorkflowJobEvent>[];
    };

    return {
        getJobs,
    };
};
