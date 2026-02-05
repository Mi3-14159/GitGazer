import {
    createIntegration as createIntegrationDDB,
    deleteIntegration as deleteIntegrationDDB,
    deleteIntegrationMembers,
    deleteIntegrationNotificationRules,
    getIntegrations as getIntegrationsDDB,
    updateIntegration as updateIntegrationDDB,
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

export const upsertIntegration = async (params: {
    id?: string;
    label?: string;
    owner?: string;
    userName?: string;
    userGroups: string[];
}): Promise<Integration> => {
    const logger = getLogger();
    const {id, label, owner, userName, userGroups} = params;

    if (id) {
        logger.info(`Updating integration ${id} with label: ${label}`);

        // Check if user is authorized to update this integration
        if (!userGroups.includes(id)) {
            throw new Error('User is not authorized to update this integration');
        }

        if (!label) {
            throw new Error('Missing label to update integration');
        }

        try {
            return await updateIntegrationDDB(id, label);
        } catch (error) {
            throw new Error(`Failed to update integration: ${error}`);
        }
    }

    if (!label || !owner || !userName) {
        throw new Error('Missing parameters to create integration');
    }

    logger.info(`Creating new integration with label: ${label}`);
    return createIntegration(label, owner, userName);
};

export const deleteIntegration = async (id: string, userGroups: string[]): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deleting integration with ID: ${id}`);

    if (!userGroups.includes(id)) {
        throw new Error('User is not authorized to delete this integration');
    }

    const results = await Promise.allSettled([deleteIntegrationDDB(id), deleteIntegrationMembers(id), deleteIntegrationNotificationRules(id)]);

    results.forEach((result) => {
        if (result.status === 'rejected') {
            throw new Error(`Failed to delete integration: ${result.reason}`);
        }
    });
};
