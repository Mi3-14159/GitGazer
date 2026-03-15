import {getLogger} from '@/logger';
import {BadRequestError, ForbiddenError, InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {integrationsQueryRelations} from '@gitgazer/db/queries';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {githubAppWebhooks, integrations, userAssignments} from '@gitgazer/db/schema/github/workflows';
import {Integration} from '@gitgazer/db/types';
import {and, eq, sql} from 'drizzle-orm';
import {deprovisionAllWebhooks, updateAllWebhookSecrets} from './webhookProvisioning';

export const getIntegrations = async (params: {integrationIds: string[]}): Promise<Integration[]> => {
    const logger = getLogger();
    const {integrationIds} = params;

    logger.info(`Getting integrations: ${integrationIds.join(', ')}`, {integrationIds});
    if (integrationIds.length === 0) {
        return [];
    }

    const results = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            return await tx.query.integrations.findMany({
                with: integrationsQueryRelations,
            });
        },
    });

    return results;
};

export const upsertIntegration = async (params: {id?: string; label?: string; userId?: number; integrationIds: string[]}): Promise<Integration> => {
    const logger = getLogger();
    const {id, label, userId, integrationIds} = params;

    if (id) {
        logger.info(`Updating integration ${id} with label: ${label}`);

        if (!label) {
            throw new BadRequestError('Missing label for integration update');
        }

        // Use RLS to ensure only accessible integrations can be updated
        const results = await withRlsTransaction({
            integrationIds,
            userName: gitgazerWriter.name,
            callback: async (tx: RdsTransaction) => {
                return await tx.update(integrations).set({label: label.trim()}).where(eq(integrations.integrationId, id)).returning();
            },
        });

        if (results.length === 0) {
            throw new UnauthorizedError('Integration not found or access denied');
        }

        // Fetch the updated integration with relations
        const fullIntegrations = await getIntegrations({integrationIds: [id]});
        if (!fullIntegrations[0]) {
            throw new InternalServerError('Failed to fetch updated integration');
        }
        return fullIntegrations[0];
    }

    if (!label || !userId) {
        throw new BadRequestError('Missing parameters to create integration');
    }

    return await createIntegration(label, userId);
};

const createIntegration = async (label: string, ownerId: number): Promise<Integration> => {
    const logger = getLogger();
    logger.info(`Creating new integration with label: ${label}`);

    if (isNaN(ownerId)) {
        throw new BadRequestError('Invalid owner ID');
    }

    try {
        // Insert integration and user assignment in a transaction
        const insertedIntegration = await db.transaction(async (tx) => {
            const [integration] = await tx
                .insert(integrations)
                .values({
                    label: label.trim(),
                    ownerId,
                })
                .returning();

            await tx.insert(userAssignments).values({
                integrationId: integration.integrationId,
                userId: ownerId,
            });

            return integration;
        });

        logger.info(`Successfully created integration '${label}:${insertedIntegration.integrationId}'`);

        // Fetch the created integration with relations
        const fullIntegrations = await getIntegrations({integrationIds: [insertedIntegration.integrationId]});
        const created = fullIntegrations[0] ?? {...insertedIntegration, githubAppInstallations: []};
        return created;
    } catch (error: any) {
        logger.error(`Failed to create integration '${label}'`, {error: error?.message});
        throw new InternalServerError('Failed to create integration');
    }
};

export const deleteIntegration = async (id: string, integrationIds: string[], userId: number): Promise<void> => {
    const logger = getLogger();
    logger.info(`User ${userId} is attempting to delete integration ${id}`);

    try {
        // Remove any leftover webhooks from GitHub (e.g. from a previously unlinked GitHub App)
        const webhooks = await withRlsTransaction({
            integrationIds,
            callback: async (tx: RdsTransaction) => {
                return await tx
                    .select({installationId: githubAppWebhooks.installationId})
                    .from(githubAppWebhooks)
                    .where(eq(githubAppWebhooks.integrationId, id))
                    .groupBy(githubAppWebhooks.installationId);
            },
        });

        for (const {installationId} of webhooks) {
            try {
                await deprovisionAllWebhooks(id, installationId);
            } catch (error) {
                logger.warn(`Failed to deprovision webhooks for installation ${installationId}`, {error});
            }
        }

        await withRlsTransaction({
            integrationIds,
            userName: gitgazerWriter.name,
            callback: async (tx: RdsTransaction) => {
                // Delete integration (cascades to user-assignments and notification-rules via foreign key)
                await tx.delete(integrations).where(and(eq(integrations.integrationId, id), eq(integrations.ownerId, userId)));
            },
        });

        logger.info(`Successfully deleted integration '${id}'`);
    } catch (error: any) {
        if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
            throw error;
        }
        logger.error(`Failed to delete integration ${id}`, {error: error?.message});
        throw new InternalServerError('Failed to delete integration');
    }
};

export const getUserIntegrations = async (userId: number): Promise<string[]> => {
    const logger = getLogger();
    logger.info(`Getting integrations for user ${userId}`);
    if (isNaN(userId)) {
        logger.warn(`Invalid user ID: ${userId}`);
        return [];
    }

    const assignments = await db
        .select({integrationId: userAssignments.integrationId})
        .from(userAssignments)
        .where(eq(userAssignments.userId, userId));

    return assignments.map((a) => a.integrationId);
};

export const rotateSecret = async (params: {integrationId: string; integrationIds: string[]}): Promise<Integration> => {
    const logger = getLogger();
    const {integrationId, integrationIds} = params;

    logger.info(`Rotating secret for integration ${integrationId}`);

    // Generate a new secret and update the integration
    const results = await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            return await tx
                .update(integrations)
                .set({secret: sql`gen_random_uuid()`})
                .where(eq(integrations.integrationId, integrationId))
                .returning();
        },
    });

    if (results.length === 0) {
        throw new UnauthorizedError('Integration not found or access denied');
    }

    const newSecret = results[0].secret;

    // Update all linked GitHub App webhooks with the new secret
    const webhookInstallations = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            return await tx
                .select({installationId: githubAppWebhooks.installationId})
                .from(githubAppWebhooks)
                .where(eq(githubAppWebhooks.integrationId, integrationId))
                .groupBy(githubAppWebhooks.installationId);
        },
    });

    for (const {installationId} of webhookInstallations) {
        try {
            await updateAllWebhookSecrets(integrationId, installationId, newSecret);
        } catch (error) {
            logger.error(`Failed to update webhook secrets for installation ${installationId}`, {error});
        }
    }

    // Return the full integration with relations
    const fullIntegrations = await getIntegrations({integrationIds: [integrationId]});
    if (!fullIntegrations[0]) {
        throw new InternalServerError('Failed to fetch updated integration');
    }
    return fullIntegrations[0];
};
