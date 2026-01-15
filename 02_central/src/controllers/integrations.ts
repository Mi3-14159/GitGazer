import {
    createIntegration as createIntegrationDDB,
    deleteIntegration as deleteIntegrationDDB,
    deleteIntegrationMembers,
    getIntegrations as getIntegrationsDDB,
} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {Integration} from '@common/types';

export const getIntegrations = async (params: {integrationIds: string[]; limit?: number}): Promise<Integration[]> => {
    const {integrationIds} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const integrations = await getIntegrationsDDB(integrationIds);

    return integrations as Integration[];
};

export const createIntegration = async (label: string, owner: string, userName: string): Promise<Integration> => {
    const logger = getLogger();
    logger.info(`Creating integration with label: ${label} for owner: ${owner} and user name: ${userName}`);
    const integration: Integration = {
        id: crypto.randomUUID(),
        label,
        owner,
        secret: crypto.randomUUID(),
    };

    try {
        await createIntegrationDDB(integration, owner);
    } catch (error) {
        throw new Error(`Failed to create integration: ${error}`);
    }

    return integration;
};

export const deleteIntegration = async (id: string, userGroups: string[]): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deleting integration with ID: ${id}`);

    // Check if the user is authorized to delete the integration
    if (!userGroups.includes(id)) {
        throw new Error('User is not authorized to delete this integration');
    }

    const results = await Promise.allSettled([await deleteIntegrationDDB(id), await deleteIntegrationMembers(id)]);

    results.forEach((result) => {
        if (result.status === 'rejected') {
            throw new Error(`Failed to delete integration: ${result.reason}`);
        }
    });
};
