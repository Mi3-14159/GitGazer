import {
    createIntegration as createIntegrationDDB,
    deleteIntegration as deleteIntegrationDDB,
    deleteIntegrationMembers,
    deleteIntegrationNotificationRules,
    getIntegrations as getIntegrationsDDB,
    updateIntegration as updateIntegrationDDB,
} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {BadRequestError, InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
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
        throw new InternalServerError('Failed to create integration', undefined, {cause: error});
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

        if (!userGroups.includes(id)) {
            throw new UnauthorizedError('User is not authorized to update this integration');
        }

        if (!label) {
            throw new BadRequestError('Missing label for integration update');
        }

        try {
            return await updateIntegrationDDB(id, label);
        } catch (error) {
            throw new InternalServerError('Failed to update integration', undefined, {cause: error});
        }
    }

    if (!label || !owner || !userName) {
        throw new BadRequestError('Missing parameters to create integration');
    }

    logger.info(`Creating new integration with label: ${label}`);
    return createIntegration(label, owner, userName);
};

export const deleteIntegration = async (id: string, userGroups: string[]): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deleting integration with ID: ${id}`);

    if (!userGroups.includes(id)) {
        throw new UnauthorizedError('User is not authorized to delete this integration');
    }

    const results = await Promise.allSettled([deleteIntegrationDDB(id), deleteIntegrationMembers(id), deleteIntegrationNotificationRules(id)]);

    const failedResults = results.filter((result) => result.status === 'rejected');
    if (failedResults.length > 0) {
        logger.error(`Failed to delete integration ${id} completely`, {failedResults});
        throw new InternalServerError('Failed to delete integration completely');
    }

    logger.info(`Successfully deleted integration with ID: ${id}`);
};
