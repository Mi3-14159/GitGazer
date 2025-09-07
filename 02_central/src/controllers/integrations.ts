import {addUserToGroup, deleteGroup, newGroup} from '@/clients/cognito';
import {deleteParameter, getParameters, putParameter} from '@/clients/ssm';
import {getLogger} from '@/logger';
import {Integration} from '@common/types';

const logger = getLogger();

export const getIntegrations = async (params: {integrationIds: string[]; limit?: number}): Promise<Integration[]> => {
    const {integrationIds} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const integrations = await getParameters({
        names: integrationIds,
    });

    return integrations as Integration[];
};

export const createIntegration = async (label: string, owner: string, userName: string): Promise<Integration> => {
    logger.info(`Creating integration with label: ${label} for owner: ${owner} and user name: ${userName}`);
    const integration: Integration = {
        id: crypto.randomUUID(),
        label,
        owner,
        secret: crypto.randomUUID(),
    };

    const results = await Promise.allSettled([putParameter(integration), newGroup(integration.id, integration.label)]);

    results.forEach((result) => {
        if (result.status === 'rejected') {
            throw new Error(`Failed to create integration: ${result.reason}`);
        }
    });

    await addUserToGroup(userName, integration.id);
    return integration;
};

export const deleteIntegration = async (id: string, userGroups: string[]): Promise<void> => {
    logger.info(`Deleting integration with ID: ${id}`);

    // Check if the user is authorized to delete the integration
    if (!userGroups.includes(id)) {
        throw new Error('User is not authorized to delete this integration');
    }

    const results = await Promise.allSettled([await deleteParameter(id), await deleteGroup(id)]);

    results.forEach((result) => {
        if (result.status === 'rejected') {
            throw new Error(`Failed to delete integration: ${result.reason}`);
        }
    });
};
