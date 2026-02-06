import {
    createIntegration as createIntegrationDDB,
    deleteIntegration as deleteIntegrationDDB,
    deleteIntegrationMembers,
    deleteIntegrationNotificationRules,
    getIntegrations as getIntegrationsDDB,
    updateIntegration as updateIntegrationDDB,
} from '@/clients/dynamodb';
import {createLambdaRole, deleteRole, getIamRoleArn, getIamRoleName} from '@/clients/iam';
import {createDataFilter, deleteDataFilter, grantLakeFormationPermissions, revokeLakeFormationPermissions} from '@/clients/lakeformation';
import {getLogger} from '@/logger';
import {BadRequestError, ForbiddenError, InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {Integration} from '@common/types';

const environment = process.env.ENVIRONMENT;
if (!environment) {
    throw new Error('ENVIRONMENT environment variable is not set');
}

export const getIntegrations = async (params: {integrationIds: string[]; limit?: number}): Promise<Integration[]> => {
    const {integrationIds} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const integrations = await getIntegrationsDDB(integrationIds);

    return integrations as Integration[];
};

export const upsertIntegration = async (params: {
    id?: string;
    label?: string;
    owner?: string;
    userId?: string;
    integrationIds: string[];
}): Promise<Integration> => {
    const logger = getLogger();
    const {id, label, owner, userId, integrationIds} = params;

    if (id) {
        logger.info(`Updating integration ${id} with label: ${label}`);

        if (!integrationIds.includes(id)) {
            throw new UnauthorizedError('User is not authorized to update this integration');
        }

        if (!label) {
            throw new BadRequestError('Missing label for integration update');
        }

        const integration = await updateIntegrationDDB(id, label);
        await handlePermissions(id);
        return integration;
    }

    if (!label || !owner || !userId) {
        throw new BadRequestError('Missing parameters to create integration');
    }

    return await createIntegration(label, owner);
};

const createIntegration = async (label: string, owner: string): Promise<Integration> => {
    const logger = getLogger();
    logger.info(`Creating new integration with label: ${label}`);

    const integration: Integration = {
        id: crypto.randomUUID(),
        label,
        owner,
        secret: crypto.randomUUID(),
    };

    const results = await Promise.allSettled([createIntegrationDDB(integration), handlePermissions(integration.id)]);

    const failedResults = results.filter((result) => result.status === 'rejected');
    if (failedResults.length > 0) {
        logger.error(`Failed to create integration '${label}:${integration.id}'`, {failedResults});
        throw new InternalServerError('Failed to create integration');
    }

    logger.info(`Successfully created integration '${label}:${integration.id}'`);
    return integration;
};

const handlePermissions = async (integrationId: string, toDelete?: boolean): Promise<void> => {
    if (toDelete) {
        const roleName = getIamRoleName(integrationId);
        const roleArn = getIamRoleArn(integrationId);

        const results = await Promise.allSettled([
            revokeLakeFormationPermissions({roleArn, integrationId}),
            deleteDataFilter({integrationId}),
            deleteRole(roleName),
        ]);

        const failedResults = results.filter((result) => result.status === 'rejected');
        if (failedResults.length > 0) {
            throw new InternalServerError('Failed to revoke permissions for integration', undefined, {failedResults});
        }

        return;
    }

    const role = await createLambdaRole(
        getIamRoleName(integrationId),
        `GitGazer (${environment}) Lambda execution role for integration ${integrationId}`,
    );

    const results = await Promise.allSettled([grantLakeFormationPermissions({roleArn: role.Arn!, integrationId}), createDataFilter({integrationId})]);

    const failedResults = results.filter((result) => result.status === 'rejected');
    if (failedResults.length > 0) {
        throw new InternalServerError('Failed to set up permissions for integration', undefined, {failedResults});
    }
};

export const deleteIntegration = async (id: string, userGroups: string[], userId: string): Promise<void> => {
    const logger = getLogger();
    logger.info(`User ${userId} is attempting to delete integration ${id}`);

    if (!userGroups.includes(id)) {
        throw new UnauthorizedError('User is not authorized to delete this integration');
    }

    const integration = await getIntegrationsDDB([id]);
    if (integration.length === 0) {
        throw new BadRequestError('Integration not found');
    }

    if (integration[0].owner !== userId) {
        throw new ForbiddenError('User is not the owner of this integration');
    }

    const results = await Promise.allSettled([
        deleteIntegrationDDB(id),
        deleteIntegrationMembers(id),
        deleteIntegrationNotificationRules(id),
        handlePermissions(id, true),
    ]);

    const failedResults = results.filter((result) => result.status === 'rejected');
    if (failedResults.length > 0) {
        logger.error(`Failed to delete integration ${id} completely`, {failedResults});
        throw new InternalServerError('Failed to delete integration completely');
    }

    logger.info(`Successfully deleted integration '${id}'`);
};
