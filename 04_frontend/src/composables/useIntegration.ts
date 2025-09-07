import {Integration} from '@common/types';
import {del, get, post} from 'aws-amplify/api';
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

    const createIntegration = async (label: string): Promise<Integration> => {
        const session = await fetchAuthSession();
        const authToken = session.tokens?.idToken;

        const restOperation = post({
            apiName: 'api',
            path: '/integrations',
            options: {
                withCredentials: true,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                body: {label},
            },
        });

        const {body} = await restOperation.response;
        return (await body.json()) as Integration;
    };

    const deleteIntegration = async (id: string): Promise<void> => {
        const session = await fetchAuthSession();
        const authToken = session.tokens?.idToken;

        const restOperation = del({
            apiName: 'api',
            path: `/integrations/${id}`,
            options: {
                withCredentials: true,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            },
        });

        if ((await restOperation.response).statusCode === 204) {
            return;
        }

        throw new Error(`Failed to delete integration: ${(await restOperation.response).statusCode}`);
    };

    return {
        getIntegrations,
        createIntegration,
        deleteIntegration,
    };
};
