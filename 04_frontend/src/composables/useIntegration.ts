import {Integration} from '@common/types';
import {del, get, post} from 'aws-amplify/api';
import {ref} from 'vue';

export const useIntegration = () => {
    const isLoadingIntegrations = ref(false);

    const getIntegrations = async () => {
        isLoadingIntegrations.value = true;
        const restOperation = get({
            apiName: 'api',
            path: '/integrations',
        });

        const {body} = await restOperation.response;
        const integrations = (await body.json()) as Integration[];
        isLoadingIntegrations.value = false;

        return integrations;
    };

    const createIntegration = async (label: string): Promise<Integration> => {
        const restOperation = post({
            apiName: 'api',
            path: '/integrations',
            options: {
                body: {label},
            },
        });

        const {body} = await restOperation.response;
        return (await body.json()) as Integration;
    };

    const deleteIntegration = async (id: string): Promise<void> => {
        const restOperation = del({
            apiName: 'api',
            path: `/integrations/${id}`,
        });

        if ((await restOperation.response).statusCode === 204) {
            return;
        }

        throw new Error(`Failed to delete integration: ${(await restOperation.response).statusCode}`);
    };

    return {
        getIntegrations,
        isLoadingIntegrations,
        createIntegration,
        deleteIntegration,
    };
};
