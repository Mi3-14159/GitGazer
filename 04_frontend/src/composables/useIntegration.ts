import {Integration} from '@common/types';
import {get} from 'aws-amplify/api';
import {fetchAuthSession} from 'aws-amplify/auth';

export const useIntegration = () => {
    const getIntegrations = async () => {
        const session = await fetchAuthSession();
        const authToken = session.tokens?.idToken;

        const restOperation = get({
            apiName: 'api',
            path: '/integrations',
            options: {
                withCredentials: true,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            },
        });

        const {body} = await restOperation.response;
        return (await body.json()) as Integration[];
    };

    return {
        getIntegrations,
    };
};
